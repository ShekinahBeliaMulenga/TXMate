
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
  } from "@aws-sdk/client-s3";
  import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
  
  let client: S3Client | undefined;
  
  function getRequiredEnv(name: string): string {
    const value = process.env[name];
  
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  
    return value;
  }
  
  export function getR2Client(): S3Client {
    if (!client) {
      client = new S3Client({
        region: "auto",
        endpoint: getRequiredEnv("R2_ENDPOINT"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
          secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
        },
      });
    }
  
    return client;
  }
  
  export function getR2BucketName(): string {
    return getRequiredEnv("R2_BUCKET_NAME");
  }
  
  export async function uploadR2Object(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    try {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: getR2BucketName(),
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: "private, max-age=3600",
        }),
      );
    } catch (error) {
      const err = error as {
        name?: string;
        message?: string;
        $metadata?: {
          httpStatusCode?: number;
          attempts?: number;
        };
        $response?: {
          statusCode?: number;
          headers?: Record<string, string>;
        };
      };
  
      const response = err.$response;
  
      console.error("R2 upload diagnostics:", {
        errorName: err.name,
        errorMessage: err.message,
        statusCode:
          response?.statusCode ?? err.$metadata?.httpStatusCode,
        contentType: response?.headers?.["content-type"],
        server: response?.headers?.["server"],
        cfRay: response?.headers?.["cf-ray"],
        requestId: response?.headers?.["x-amz-request-id"],
        attempts: err.$metadata?.attempts,
      });
  
      throw error;
    }
  }
  
  export async function getR2ImageUrl(key: string): Promise<string> {
    return getSignedUrl(
      getR2Client(),
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
      }),
      { expiresIn: 3600 },
    );
  }
  
  export async function deleteR2Object(key: string): Promise<void> {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
      }),
    );
  }
  