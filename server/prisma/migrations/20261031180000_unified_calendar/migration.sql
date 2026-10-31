ALTER TABLE "CalendarEvent"
  ADD COLUMN "startDate" TEXT,
  ADD COLUMN "endDate" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN "location" TEXT,
  ADD COLUMN "color" TEXT NOT NULL DEFAULT 'amber',
  ADD COLUMN "reminderMinutes" INTEGER,
  ADD COLUMN "recurrenceRule" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "recurrenceDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "recurrenceUntil" TEXT,
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "excludedOccurrences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "seriesId" TEXT,
  ADD COLUMN "seriesOccurrenceDate" TEXT;

ALTER TABLE "UserSettings"
  ADD COLUMN "calendarView" TEXT NOT NULL DEFAULT 'agenda',
  ADD COLUMN "calendarVisibleSources" TEXT[] NOT NULL DEFAULT ARRAY['class', 'assignment', 'exam', 'personal', 'study']::TEXT[],
  ADD COLUMN "calendarVisibleCategories" TEXT[] NOT NULL DEFAULT ARRAY['personal', 'college', 'study', 'work', 'health', 'other']::TEXT[],
  ADD COLUMN "calendarTimezone" TEXT;

CREATE INDEX "CalendarEvent_userId_recurrenceRule_recurrenceUntil_idx"
  ON "CalendarEvent"("userId", "recurrenceRule", "recurrenceUntil");

CREATE INDEX "CalendarEvent_userId_seriesId_idx"
  ON "CalendarEvent"("userId", "seriesId");

CREATE UNIQUE INDEX "CalendarEvent_userId_seriesId_seriesOccurrenceDate_key"
  ON "CalendarEvent"("userId", "seriesId", "seriesOccurrenceDate");

ALTER TABLE "CalendarEvent"
  ADD CONSTRAINT "CalendarEvent_userId_seriesId_fkey"
  FOREIGN KEY ("userId", "seriesId") REFERENCES "CalendarEvent"("userId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Assignment"
  ADD COLUMN "reminderMinutes" INTEGER;
