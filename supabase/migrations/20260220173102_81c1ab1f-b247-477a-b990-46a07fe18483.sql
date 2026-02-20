-- Add send_time (HH:MM format) and last_sent_date to reminders
ALTER TABLE public.reminders 
  ADD COLUMN send_time text NOT NULL DEFAULT '08:00',
  ADD COLUMN last_sent_date date DEFAULT null;
