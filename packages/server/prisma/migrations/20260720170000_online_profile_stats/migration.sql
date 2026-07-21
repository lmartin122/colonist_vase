-- Persist a stable room identity and every aggregate used by the online profile.
ALTER TABLE "Game" ADD COLUMN "roomCode" TEXT;
UPDATE "Game" SET "roomCode" = "id" WHERE "roomCode" IS NULL;
ALTER TABLE "Game" ALTER COLUMN "roomCode" SET NOT NULL;
ALTER TABLE "Game" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE "Game" ADD COLUMN "diceStats" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "GamePlayer" ADD COLUMN "stats" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "GamePlayer" ADD COLUMN "longestRoadLength" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GamePlayer" ADD COLUMN "longestRoadAward" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GamePlayer" ADD COLUMN "largestArmyAward" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GamePlayer" ADD COLUMN "abandoned" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Game_roomCode_key" ON "Game"("roomCode");
