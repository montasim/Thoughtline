import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { schedulePreviewSchema } from '../../../domain/schemas';
import { Button } from '../../primitives/button';
import { DialogContent, DialogRoot, DialogTrigger } from '../../primitives/dialog';
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '../../primitives/select';
import { SwitchControl } from '../../primitives/switch';

export function SchedulePreviewDialog() {
  const [enabled, setEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [frequency, setFrequency] = useState('daily');
  const [weekday, setWeekday] = useState('Monday');
  const [day, setDay] = useState('1');
  const [time, setTime] = useState('09:00');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const savePreview = () => {
    const result = schedulePreviewSchema.safeParse({
      enabled,
      frequency,
      weekday: frequency === 'weekly' ? weekday : undefined,
      day: frequency === 'monthly' ? day : undefined,
      time,
      email,
      emailEnabled,
    });
    if (!result.success) {
      setSaved(false);
      setError(result.error.issues[0]?.message ?? 'Review the schedule fields.');
      return;
    }
    setError('');
    setSaved(true);
  };

  return (
    <DialogRoot
      onOpenChange={(open) => {
        if (!open) {
          setSaved(false);
          setError('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="compact">
          <Calendar className="size-4" />
          Schedule
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Schedule idea searches"
        description="Preview how scheduled research will work after the scheduling service is connected."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-soft p-3">
            <div>
              <Label htmlFor="schedule-enabled">Enable schedule</Label>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                One recurring search will run at a time.
              </p>
            </div>
            <SwitchControl id="schedule-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <FieldGroup>
            <Label htmlFor="schedule-frequency">Frequency</Label>
            <SelectRoot value={frequency} onValueChange={setFrequency} disabled={!enabled}>
              <SelectTrigger id="schedule-frequency">
                <span>{frequencyLabel(frequency)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Every hour</SelectItem>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="monthly">Every month</SelectItem>
              </SelectContent>
            </SelectRoot>
          </FieldGroup>
          {frequency !== 'hourly' ? (
            <div className="grid grid-cols-2 gap-3">
              {frequency === 'weekly' ? (
                <FieldGroup>
                  <Label htmlFor="schedule-weekday">Weekday</Label>
                  <SelectRoot value={weekday} onValueChange={setWeekday} disabled={!enabled}>
                    <SelectTrigger id="schedule-weekday">
                      <span>{weekday}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ].map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                </FieldGroup>
              ) : null}
              {frequency === 'monthly' ? (
                <FieldGroup>
                  <Label htmlFor="schedule-day">Day</Label>
                  <Input
                    id="schedule-day"
                    type="number"
                    min="1"
                    max="28"
                    value={day}
                    onChange={(event) => setDay(event.target.value)}
                    disabled={!enabled}
                  />
                </FieldGroup>
              ) : null}
              <FieldGroup>
                <Label htmlFor="schedule-time">Time</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={!enabled}
                />
              </FieldGroup>
            </div>
          ) : null}
          <FieldGroup>
            <Label htmlFor="schedule-email">Email</Label>
            <Input
              id="schedule-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={!enabled}
            />
          </FieldGroup>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-soft p-3">
            <div>
              <Label htmlFor="email-notification">Email results</Label>
              <p className="mt-1 text-[10.5px] text-muted">
                Receive new ideas when a scheduled search finishes.
              </p>
            </div>
            <SwitchControl
              id="email-notification"
              checked={emailEnabled}
              onCheckedChange={setEmailEnabled}
              disabled={!enabled}
            />
          </div>
          {saved ? (
            <p
              role="status"
              className="rounded-lg border border-proof/30 bg-proof-soft p-3 text-[11px] leading-relaxed text-proof"
            >
              Schedule preview saved for this panel session. Scheduling becomes available when the
              service is connected.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[11px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button variant="primary" onClick={savePreview}>
              Save preview
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

function frequencyLabel(value: string): string {
  return (
    { hourly: 'Every hour', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' }[
      value
    ] ?? 'Every day'
  );
}
