-- AlterTable: opt-in exposure of miss reasons / week notes per API token (default off).
ALTER TABLE "ApiToken" ADD COLUMN "includeReasons" BOOLEAN NOT NULL DEFAULT false;
