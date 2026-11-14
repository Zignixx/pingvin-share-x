import { Group, Space, Text, Title } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import ManageShareTable from "../../components/admin/shares/ManageShareTable";
import DiskUsage from "../../components/admin/shares/DiskUsage";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare } from "../../types/share.type";
import { AdminShare } from "../../components/admin/shares/ManageShareTable";
import toast from "../../utils/toast.util";

const Shares = () => {
  const [shares, setShares] = useState<AdminShare[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const modals = useModals();
  const t = useTranslate();

  const getShares = () => {
    setIsLoading(true);
    shareService.list().then((shares) => {
      setShares(shares);
      setIsLoading(false);
    });
  };

  const deleteShare = (share: MyShare) => {
    modals.openConfirmModal({
      title: t("admin.shares.edit.delete.title", {
        id: share.id,
      }),
      children: (
        <Text size="sm">
          <FormattedMessage id="admin.shares.edit.delete.description" />
        </Text>
      ),
      labels: {
        confirm: t("common.button.delete"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        shareService
          .remove(share.id)
          .then(() =>
            setShares((current) => current.filter((v) => v.id != share.id)),
          )
          .catch(toast.axiosError);
      },
    });
  };

  // zignixx: Zwangsloeschung, auch wenn Dateien noch offen sind
  const forceDeleteShare = (share: MyShare) => {
    modals.openConfirmModal({
      title: t("admin.shares.force-delete.title", { id: share.id }),
      children: (
        <Text size="sm">
          <FormattedMessage id="admin.shares.force-delete.description" />
        </Text>
      ),
      labels: {
        confirm: t("admin.shares.force-delete"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        shareService
          .forceRemove(share.id)
          .then((res) => {
            setShares((current) => current.filter((v) => v.id != share.id));
            if (res.filesRemoved)
              toast.success(t("admin.shares.force-delete.success"));
            else
              toast.error(
                t("admin.shares.force-delete.files-left", {
                  error: res.fileError ?? "",
                }),
              );
          })
          .catch(toast.axiosError);
      },
    });
  };

  useEffect(() => {
    getShares();
  }, []);

  return (
    <>
      <Meta title={t("admin.shares.title")} />
      <Group position="apart" align="center" mb={20}>
        <Title mb={0} order={3}>
          <FormattedMessage id="admin.shares.title" />
        </Title>
        <DiskUsage />
      </Group>

      <ManageShareTable
        shares={shares}
        updateShare={(updatedShare) =>
          setShares(
            shares.map((share) =>
              share.id === updatedShare.id ? updatedShare : share,
            ),
          )
        }
        deleteShare={deleteShare}
        forceDeleteShare={forceDeleteShare}
        isLoading={isLoading}
      />
      <Space h="xl" />
    </>
  );
};

export default Shares;
