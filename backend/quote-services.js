import { quotePrefix } from "./environment.js";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  EndUserMessagingClient,
  SendNotifyCodeVerificationCommand,
  ValidateNotifyCodeVerificationCommand,
} from "@aws-sdk/client-endusermessaging";
import { readFile } from "node:fs/promises";

export function quoteServices({ production }) {
  const prefix = quotePrefix();
  const region = process.env.AWS_REGION || "us-east-2";
  const bucket = process.env.QUOTES_BUCKET;
  const s3 = bucket
    ? new S3Client({
        region,
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 5000, requestTimeout: 60000 },
      })
    : null;
  const notify = new EndUserMessagingClient({
    region: process.env.SMS_REGION || region,
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  });
  return {
    storage: {
      async remove({ key }) {
        if (!key.startsWith(prefix + "/"))
          throw new Error("WrongEnvironmentPrefix");
        if (!s3) throw new Error("S3NotConfigured");
        let keyMarker, versionMarker;
        do {
          const page = await s3.send(
            new ListObjectVersionsCommand({
              Bucket: bucket,
              Prefix: key,
              KeyMarker: keyMarker,
              VersionIdMarker: versionMarker,
            }),
          );
          for (const version of [
            ...(page.Versions || []),
            ...(page.DeleteMarkers || []),
          ]) {
            if (version.Key === key)
              await s3.send(
                new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: key,
                  VersionId: version.VersionId,
                }),
              );
          }
          keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
          versionMarker = page.IsTruncated
            ? page.NextVersionIdMarker
            : undefined;
        } while (keyMarker);
      },
      async put({ key, filePath, size, mime, checksum }) {
        if (!key.startsWith(prefix + "/"))
          throw new Error("WrongEnvironmentPrefix");
        if (s3) {
          // Stable keys and checksums allow recovery after S3 succeeds but the DB acknowledgement is lost.
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              // Attachments are capped at 20 MiB; a buffer lets SDK retries replay the request.
              Body: await readFile(filePath),
              ContentLength: size,
              ContentType: mime,
              ServerSideEncryption: "AES256",
              ChecksumSHA256: Buffer.from(checksum, "hex").toString("base64"),
              Metadata: { sha256: checksum },
            }),
          );
          const saved = await s3.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key }),
          );
          if (
            saved.ContentLength !== size ||
            saved.Metadata?.sha256 !== checksum
          )
            throw new Error("StorageVerificationFailed");
        } else {
          throw new Error("S3NotConfigured");
        }
      },
    },
    otp: {
      async send({ phone, reference }) {
        if (!production && process.env.GURU_DEV_OTP === "1")
          return { id: reference };
        if (
          !process.env.NOTIFY_CONFIGURATION_ID ||
          !process.env.NOTIFY_CODE_CONFIGURATION_ID
        )
          throw new Error("SMSNotConfigured");
        const result = await notify.send(
          new SendNotifyCodeVerificationCommand({
            channel: "TEXT",
            destinationIdentity: phone,
            referenceId: reference,
            originationIdentity: process.env.NOTIFY_CONFIGURATION_ID,
            notifyCodeConfiguration: process.env.NOTIFY_CODE_CONFIGURATION_ID,
            overrideCodeConfigurationParameters: {
              codeType: "NUMERIC",
              codeLength: 6,
              maxAttempts: 5,
              validityPeriodMinutes: 5,
            },
          }),
        );
        return { id: result.verificationId };
      },
      async verify({ phone, reference, code }) {
        if (!production && process.env.GURU_DEV_OTP === "1")
          return code === "123456";
        const result = await notify.send(
          new ValidateNotifyCodeVerificationCommand({
            destinationIdentity: phone,
            referenceId: reference,
            code,
          }),
        );
        return result.status === "VALID";
      },
    },
  };
}
