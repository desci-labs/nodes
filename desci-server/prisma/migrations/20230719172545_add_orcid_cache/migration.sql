-- CreateTable
CREATE TABLE "OrcidProfile" (
    "id" SERIAL NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresIn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcidProfile_pkey" PRIMARY KEY ("id")
);
