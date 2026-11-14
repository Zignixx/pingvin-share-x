import { OmitType } from "@nestjs/swagger";
import { Expose, plainToClass, Type } from "class-transformer";
import { FileDTO } from "src/file/dto/file.dto";
import { ShareDTO } from "./share.dto";
import { MyShareSecurityDTO } from "./myShareSecurity.dto";

export class AdminShareDTO extends OmitType(ShareDTO, [
  "files",
  "from",
  "fromList",
] as const) {
  @Expose()
  views: number;

  @Expose()
  createdAt: Date;

  @Expose()
  security?: MyShareSecurityDTO;

  @Expose()
  recipients: string[];

  // zignixx: Dateiliste fuer aufklappbare Zeilen und Dateinamen-Suche im Admin-Bereich
  @Expose()
  @Type(() => FileDTO)
  files: FileDTO[];

  @Expose()
  uploadLocked: boolean;

  @Expose()
  storageProvider: string;

  from(partial: Partial<AdminShareDTO>) {
    return plainToClass(AdminShareDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<AdminShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(AdminShareDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
