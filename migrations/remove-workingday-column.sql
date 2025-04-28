-- Remove the workingday column from the holidays table
ALTER TABLE holidays DROP COLUMN IF EXISTS workingday;
