-- Player-chosen display name. Auth0's `name` is the email for database
-- connections, so players need a username of their own.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "usernameLower" TEXT;

-- Uniqueness is enforced on the normalized form so "Ada" and "ada" can't coexist.
CREATE UNIQUE INDEX "User_usernameLower_key" ON "User"("usernameLower");
