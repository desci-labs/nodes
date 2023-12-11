-- CreateTable
CREATE TABLE "DocumentStore" (
    "key" TEXT NOT NULL,
    "value" BYTEA NOT NULL,

    CONSTRAINT "DocumentStore_pkey" PRIMARY KEY ("key")
);
