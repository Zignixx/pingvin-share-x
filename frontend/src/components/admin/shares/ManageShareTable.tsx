// zignixx: Komplett neu gebaute Freigaben-Verwaltung.
// Sortierbar nach jeder Spalte, Suche ueber ID, Name, Ersteller, Beschreibung und
// Dateinamen, Statusfilter, aufklappbare Zeilen mit Dateiliste, Zwangsloeschung.
import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Group,
  Menu,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  createStyles,
} from "@mantine/core";
import { useClipboard, useDebouncedValue } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import moment from "moment";
import { Fragment, ReactNode, useMemo, useState } from "react";
import {
  TbAlertTriangle,
  TbChevronDown,
  TbChevronRight,
  TbChevronUp,
  TbDots,
  TbExternalLink,
  TbFile,
  TbInfoCircle,
  TbLink,
  TbLock,
  TbSearch,
  TbSelector,
  TbTrash,
  TbX,
} from "react-icons/tb";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import { MyShare } from "../../../types/share.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import toast from "../../../utils/toast.util";
import showShareLinkModal from "../../account/showShareLinkModal";
import showShareInformationsModal from "../../share/showShareInformationsModal";

export type AdminShareFile = { id: string; name: string; size: string };
export type AdminShare = Omit<MyShare, "files"> & {
  files: AdminShareFile[];
  uploadLocked?: boolean;
  storageProvider?: string;
};

type SortKey =
  | "id"
  | "name"
  | "creator"
  | "views"
  | "files"
  | "size"
  | "createdAt"
  | "expiration"
  | "deletes";
type StatusFilter = "all" | "active" | "expired" | "incomplete";
type Status = "active" | "expired" | "incomplete" | "never";

const useStyles = createStyles((theme) => ({
  th: { padding: "0 !important", whiteSpace: "nowrap" },
  sortButton: {
    width: "100%",
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[6]
          : theme.colors.gray[0],
    },
  },
  row: {
    cursor: "pointer",
    transition: "background-color 120ms ease",
    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[6]
          : theme.colors.gray[0],
    },
  },
  rowOpen: {
    backgroundColor:
      theme.colorScheme === "dark"
        ? `${theme.colors.dark[6]} !important`
        : `${theme.colors.gray[0]} !important`,
  },
  detailCell: {
    padding: "0 !important",
    borderTop: "none !important",
  },
  detail: {
    padding: theme.spacing.md,
    paddingLeft: 48,
    backgroundColor:
      theme.colorScheme === "dark"
        ? theme.colors.dark[8]
        : theme.colors.gray[0],
  },
  fileRow: {
    padding: "4px 8px",
    borderRadius: theme.radius.sm,
    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[6]
          : theme.colors.gray[1],
    },
  },
  fileHit: {
    backgroundColor:
      theme.colorScheme === "dark"
        ? theme.fn.rgba(theme.colors.yellow[8], 0.18)
        : theme.colors.yellow[1],
  },
  mono: {
    fontFamily: theme.fontFamilyMonospace,
    fontSize: theme.fontSizes.sm,
  },
}));

const ManageShareTable = ({
  shares,
  updateShare,
  deleteShare,
  forceDeleteShare,
  isLoading,
}: {
  shares: AdminShare[];
  updateShare: (share: MyShare) => void;
  deleteShare: (share: MyShare) => void;
  forceDeleteShare: (share: MyShare) => void;
  isLoading: boolean;
}) => {
  const { classes, cx } = useStyles();
  const modals = useModals();
  const clipboard = useClipboard();
  const config = useConfig();
  const t = useTranslate();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 150);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fileRetentionPeriod = config.get("share.fileRetentionPeriod");
  const fileRetentionEnabled = fileRetentionPeriod?.value !== 0;

  const isNever = (d: Date) => moment(d).unix() === 0;

  const statusOf = (share: AdminShare): Status => {
    if (share.uploadLocked === false) return "incomplete";
    if (isNever(share.expiration)) return "never";
    return moment(share.expiration).isBefore(moment()) ? "expired" : "active";
  };

  const deletesAt = (share: AdminShare): moment.Moment | null => {
    if (isNever(share.expiration) || fileRetentionPeriod?.value === -1)
      return null;
    return moment(share.expiration).add(
      fileRetentionPeriod.value,
      fileRetentionPeriod.unit,
    );
  };

  const query = debouncedSearch.trim().toLowerCase();

  const fileHits = (share: AdminShare) =>
    query
      ? (share.files ?? []).filter((f) => f.name.toLowerCase().includes(query))
      : [];

  const matches = (share: AdminShare) => {
    if (!query) return true;
    const fields = [
      share.id,
      share.name ?? "",
      share.description ?? "",
      share.creator?.username ?? "anonymous",
      ...(share.recipients ?? []),
    ];
    return (
      fields.some((f) => f.toLowerCase().includes(query)) ||
      fileHits(share).length > 0
    );
  };

  const sortValue = (share: AdminShare, key: SortKey): number | string => {
    switch (key) {
      case "id":
        return share.id.toLowerCase();
      case "name":
        return (share.name ?? "").toLowerCase();
      case "creator":
        return (share.creator?.username ?? "").toLowerCase();
      case "views":
        return share.views ?? 0;
      case "files":
        return share.files?.length ?? 0;
      case "size":
        return share.size ?? 0;
      case "createdAt":
        return moment(share.createdAt).valueOf();
      case "expiration":
        return isNever(share.expiration)
          ? Number.MAX_SAFE_INTEGER
          : moment(share.expiration).valueOf();
      case "deletes": {
        const d = deletesAt(share);
        return d ? d.valueOf() : Number.MAX_SAFE_INTEGER;
      }
    }
  };

  const visible = useMemo(() => {
    const list = shares.filter(
      (s) =>
        matches(s) &&
        (statusFilter === "all" ||
          statusOf(s) === statusFilter ||
          (statusFilter === "active" && statusOf(s) === "never")),
    );
    list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const r =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDesc ? -r : r;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares, query, statusFilter, sortKey, sortDesc]);

  const stats = useMemo(() => {
    const s = {
      total: shares.length,
      active: 0,
      expired: 0,
      size: 0,
      files: 0,
      views: 0,
    };
    for (const share of shares) {
      const st = statusOf(share);
      if (st === "active" || st === "never") s.active++;
      if (st === "expired") s.expired++;
      s.size += share.size ?? 0;
      s.files += share.files?.length ?? 0;
      s.views += share.views ?? 0;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(["views", "files", "size", "createdAt"].includes(key));
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const allOpen =
    visible.length > 0 && visible.every((s) => expanded.has(s.id));
  const toggleAll = () =>
    setExpanded(allOpen ? new Set() : new Set(visible.map((s) => s.id)));

  const shareUrl = (id: string) =>
    `${
      config.get("general.appUrl") !== config.get("general.appUrl", true)
        ? config.get("general.appUrl")
        : window.location.origin
    }/s/${id}`;

  const copyLink = (share: AdminShare) => {
    if (window.isSecureContext) {
      clipboard.copy(shareUrl(share.id));
      toast.success(t("common.notify.copied-link"));
    } else {
      showShareLinkModal(
        modals,
        share.id,
        config.get("general.appUrl"),
        config.get("general.appUrl", true),
      );
    }
  };

  const showInfo = (share: AdminShare) =>
    showShareInformationsModal(
      modals,
      share,
      parseInt(config.get("share.maxSize")),
      config.get("general.appUrl"),
      config.get("general.appUrl", true),
      { value: 0, unit: "days" },
      updateShare,
    );

  const statusBadge = (share: AdminShare) => {
    const st = statusOf(share);
    const map: Record<Status, { color: string; label: string }> = {
      active: { color: "green", label: t("admin.shares.status.active") },
      never: { color: "teal", label: t("admin.shares.status.never") },
      expired: { color: "gray", label: t("admin.shares.status.expired") },
      incomplete: {
        color: "orange",
        label: t("admin.shares.status.incomplete"),
      },
    };
    return (
      <Badge color={map[st].color} variant="light" size="sm" radius="sm">
        {map[st].label}
      </Badge>
    );
  };

  const dateCell = (d: moment.Moment | null, never: boolean) =>
    never || !d ? (
      <Text size="sm" color="dimmed">
        {t("account.shares.table.expiry-never")}
      </Text>
    ) : (
      <Tooltip label={d.format("LLL")} withArrow openDelay={300}>
        <Box>
          <Text size="sm">{d.format("L")}</Text>
          <Text size="xs" color="dimmed">
            {d.fromNow()}
          </Text>
        </Box>
      </Tooltip>
    );

  const Th = ({
    k,
    children,
    align,
  }: {
    k: SortKey;
    children: ReactNode;
    align?: "right";
  }) => {
    const Icon =
      sortKey === k ? (sortDesc ? TbChevronDown : TbChevronUp) : TbSelector;
    return (
      <th className={classes.th}>
        <UnstyledButton
          onClick={() => toggleSort(k)}
          className={classes.sortButton}
        >
          <Group
            spacing={4}
            noWrap
            position={align === "right" ? "right" : "left"}
          >
            <Text weight={600} size="sm">
              {children}
            </Text>
            <Icon size={14} style={{ opacity: sortKey === k ? 1 : 0.4 }} />
          </Group>
        </UnstyledButton>
      </th>
    );
  };

  const colCount = fileRetentionEnabled ? 11 : 10;

  return (
    <Stack spacing="md">
      <SimpleGrid
        cols={5}
        spacing="sm"
        breakpoints={[
          { maxWidth: "md", cols: 3 },
          { maxWidth: "xs", cols: 2 },
        ]}
      >
        {[
          [t("admin.shares.stats.shares"), stats.total],
          [t("admin.shares.stats.active"), stats.active],
          [t("admin.shares.stats.expired"), stats.expired],
          [t("admin.shares.stats.files"), stats.files],
          [t("admin.shares.stats.size"), byteToHumanSizeString(stats.size)],
        ].map(([label, value]) => (
          <Paper key={String(label)} withBorder radius="md" p="sm">
            <Text size="xs" color="dimmed" transform="uppercase" weight={600}>
              {label}
            </Text>
            <Text size="xl" weight={700}>
              {isLoading ? "–" : value}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>

      <Group position="apart" spacing="sm">
        <TextInput
          style={{ flex: 1, minWidth: 260 }}
          icon={<TbSearch size={16} />}
          placeholder={t("admin.shares.search.placeholder")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          rightSection={
            search ? (
              <ActionIcon size="sm" onClick={() => setSearch("")}>
                <TbX size={14} />
              </ActionIcon>
            ) : null
          }
        />
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          data={[
            { value: "all", label: t("admin.shares.filter.all") },
            { value: "active", label: t("admin.shares.filter.active") },
            { value: "expired", label: t("admin.shares.filter.expired") },
            { value: "incomplete", label: t("admin.shares.filter.incomplete") },
          ]}
        />
      </Group>

      <Group position="apart">
        <Text size="sm" color="dimmed">
          {t("admin.shares.result-count", {
            count: visible.length,
            total: shares.length,
          })}
        </Text>
        <UnstyledButton onClick={toggleAll}>
          <Text size="sm" color="victoria">
            {allOpen
              ? t("admin.shares.collapse-all")
              : t("admin.shares.expand-all")}
          </Text>
        </UnstyledButton>
      </Group>

      <Paper withBorder radius="md" style={{ overflowX: "auto" }}>
        <Table verticalSpacing="xs" fontSize="sm" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <Th k="id">{t("account.shares.table.id")}</Th>
              <Th k="name">{t("account.shares.table.name")}</Th>
              <Th k="creator">{t("admin.shares.table.username")}</Th>
              <Th k="files">{t("admin.shares.table.files")}</Th>
              <Th k="size">{t("account.shares.table.size")}</Th>
              <Th k="views">{t("account.shares.table.visitors")}</Th>
              <Th k="createdAt">{t("account.shares.table.createdAt")}</Th>
              <Th k="expiration">{t("account.shares.table.expiresAt")}</Th>
              {fileRetentionEnabled && (
                <Th k="deletes">{t("admin.shares.table.deletes")}</Th>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(colCount)].map((__, j) => (
                      <td key={j}>
                        <Skeleton height={18} />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((share) => {
                  const open =
                    expanded.has(share.id) || fileHits(share).length > 0;
                  const hits = new Set(fileHits(share).map((f) => f.id));
                  const files = [...(share.files ?? [])].sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, { numeric: true }),
                  );
                  return (
                    <Fragment key={share.id}>
                      <tr
                        className={cx(classes.row, open && classes.rowOpen)}
                        onClick={() => toggleRow(share.id)}
                      >
                        <td>
                          {open ? (
                            <TbChevronDown size={16} />
                          ) : (
                            <TbChevronRight size={16} />
                          )}
                        </td>
                        <td>
                          <Text className={classes.mono}>{share.id}</Text>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          <Group spacing={6} noWrap>
                            <Text size="sm" weight={500} lineClamp={1}>
                              {share.name || (
                                <Text span color="dimmed" italic>
                                  {t("admin.shares.unnamed")}
                                </Text>
                              )}
                            </Text>
                            {share.security?.passwordProtected && (
                              <Tooltip
                                label={t(
                                  "account.shares.table.password-protected",
                                )}
                              >
                                <Box
                                  component="span"
                                  style={{ display: "inline-flex" }}
                                >
                                  <TbLock size={14} />
                                </Box>
                              </Tooltip>
                            )}
                          </Group>
                          <Group spacing={6} mt={2}>
                            {statusBadge(share)}
                          </Group>
                        </td>
                        <td>
                          {share.creator ? (
                            share.creator.username
                          ) : (
                            <Text color="dimmed">Anonymous</Text>
                          )}
                        </td>
                        <td>{share.files?.length ?? "–"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {byteToHumanSizeString(share.size)}
                        </td>
                        <td>
                          {share.views}
                          {share.security?.maxViews ? (
                            <Text span color="dimmed">
                              {" "}
                              / {share.security.maxViews}
                            </Text>
                          ) : null}
                        </td>
                        <td>{dateCell(moment(share.createdAt), false)}</td>
                        <td>
                          {dateCell(
                            moment(share.expiration),
                            isNever(share.expiration),
                          )}
                        </td>
                        {fileRetentionEnabled && (
                          <td>
                            {dateCell(
                              deletesAt(share),
                              deletesAt(share) === null,
                            )}
                          </td>
                        )}
                        <td onClick={(e) => e.stopPropagation()}>
                          <Group spacing={6} noWrap position="right">
                            <Tooltip label={t("common.button.copy-link")}>
                              <ActionIcon
                                color="victoria"
                                variant="light"
                                size={28}
                                onClick={() => copyLink(share)}
                              >
                                <TbLink />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t("common.button.delete")}>
                              <ActionIcon
                                color="red"
                                variant="light"
                                size={28}
                                onClick={() => deleteShare(share)}
                              >
                                <TbTrash />
                              </ActionIcon>
                            </Tooltip>
                            <Menu
                              position="bottom-end"
                              withinPortal
                              shadow="md"
                            >
                              <Menu.Target>
                                <ActionIcon variant="light" size={28}>
                                  <TbDots />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  icon={<TbInfoCircle size={16} />}
                                  onClick={() => showInfo(share)}
                                >
                                  {t("common.button.info")}
                                </Menu.Item>
                                <Menu.Item
                                  icon={<TbExternalLink size={16} />}
                                  component="a"
                                  href={`/s/${share.id}`}
                                  target="_blank"
                                >
                                  {t("admin.shares.open")}
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                  color="red"
                                  icon={<TbAlertTriangle size={16} />}
                                  onClick={() => forceDeleteShare(share)}
                                >
                                  {t("admin.shares.force-delete")}
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={colCount} className={classes.detailCell}>
                          <Collapse in={open} transitionDuration={150}>
                            <Box className={classes.detail}>
                              {share.description && (
                                <Text size="sm" color="dimmed" mb="xs">
                                  {share.description}
                                </Text>
                              )}
                              {files.length === 0 ? (
                                <Text size="sm" color="dimmed">
                                  {t("admin.shares.no-files")}
                                </Text>
                              ) : (
                                <Stack spacing={0}>
                                  {files.map((f) => (
                                    <Group
                                      key={f.id}
                                      position="apart"
                                      noWrap
                                      className={cx(
                                        classes.fileRow,
                                        hits.has(f.id) && classes.fileHit,
                                      )}
                                    >
                                      <Group
                                        spacing={8}
                                        noWrap
                                        style={{ minWidth: 0 }}
                                      >
                                        <TbFile
                                          size={16}
                                          style={{
                                            flexShrink: 0,
                                            opacity: 0.6,
                                          }}
                                        />
                                        <Text
                                          size="sm"
                                          lineClamp={1}
                                          title={f.name}
                                        >
                                          {f.name}
                                        </Text>
                                      </Group>
                                      <Text
                                        size="sm"
                                        color="dimmed"
                                        style={{ whiteSpace: "nowrap" }}
                                      >
                                        {byteToHumanSizeString(
                                          parseInt(f.size),
                                        )}
                                      </Text>
                                    </Group>
                                  ))}
                                </Stack>
                              )}
                              <Group spacing="lg" mt="sm">
                                {(share.recipients?.length ?? 0) > 0 && (
                                  <Text size="xs" color="dimmed">
                                    {t("account.shares.table.recipients")}:{" "}
                                    {share.recipients.join(", ")}
                                  </Text>
                                )}
                                <Text size="xs" color="dimmed">
                                  {t("account.shares.table.createdAt")}:{" "}
                                  {moment(share.createdAt).format("LLL")}
                                </Text>
                                {share.storageProvider && (
                                  <Text size="xs" color="dimmed">
                                    Storage: {share.storageProvider}
                                  </Text>
                                )}
                              </Group>
                            </Box>
                          </Collapse>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={colCount}>
                  <Text align="center" color="dimmed" py="lg">
                    {t("admin.shares.empty")}
                  </Text>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Paper>
    </Stack>
  );
};

export default ManageShareTable;
