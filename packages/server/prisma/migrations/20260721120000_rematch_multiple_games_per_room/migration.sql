-- A room keeps its code across rematches, so several games can share a roomCode.
-- Identify a game by (roomCode, startedAt) instead of roomCode alone.
DROP INDEX IF EXISTS "Game_roomCode_key";

CREATE UNIQUE INDEX "Game_roomCode_startedAt_key" ON "Game"("roomCode", "startedAt");
