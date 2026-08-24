import { useEffect, useRef, useState } from 'react';
import {
  Alert01Icon,
  BracketsIcon,
  CpuIcon,
  ShieldCheckIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { AppError, toAppError, type AppErrorCode } from '../../../application/errors';
import { proposeLayoutCalibration } from '../../../application/workflows';
import {
  calibrationCandidateSchema,
  calibrationCaptureSchema,
  type CalibrationCandidate,
  type CalibrationCapture,
} from '../../../domain/calibration';
import { isProviderReady } from '../../../domain/schemas';
import { hasProviderPermissions } from '../../../infrastructure/permissions';
import { storageRepository } from '../../../infrastructure/storage/chrome-storage';
import type { RuntimeResponse } from '../../../shared/protocol';
import { Button } from '../../primitives/button';
import { Card } from '../../primitives/card';
import { PageHeading, StatusBadge } from '../../components/common';
import { useForegroundJob } from '../../hooks/use-foreground-job';
import { useAppStore } from '../../state/app-store';
import { HugeIcon } from '../../components/huge-icon';

type Phase = 'checking' | 'setup' | 'evidence' | 'preview' | 'saving' | 'success' | 'error';

export function CalibrationView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { app, session, refresh } = useAppStore();
  const job = useForegroundJob();
  const [phase, setPhase] = useState<Phase>('checking');
  const [capture, setCapture] = useState<CalibrationCapture | null>(null);
  const [candidate, setCandidate] = useState<CalibrationCandidate | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const request = session?.calibration.status === 'pending' ? session.calibration : null;
  const requestId = request?.requestId;
  const requestTabId = request?.tabId;
  const requestFrameId = request?.frameId;
  const requestKind = request?.kind;
  const requestMode = request?.mode;
  const appLoaded = app !== null;
  const aiSetupReady = app ? app.settings.consent.accepted && isProviderReady(app.settings) : false;

  useEffect(() => {
    if (
      !appLoaded ||
      !requestId ||
      requestTabId === undefined ||
      requestFrameId === undefined ||
      !requestKind ||
      !requestMode ||
      started.current === requestId
    ) {
      return;
    }
    started.current = requestId;
    let active = true;
    void (async () => {
      try {
        if (requestMode === 'ai' && (!aiSetupReady || !(await hasProviderPermissions()))) {
          if (active) setPhase('setup');
          return;
        }
        const response: RuntimeResponse = await chrome.tabs.sendMessage(
          requestTabId,
          {
            type: 'content:capture-calibration',
            requestId,
            kind: requestKind,
          },
          { frameId: requestFrameId },
        );
        if (!response.ok || !('capture' in response)) {
          throw new AppError(
            'unsupported-layout',
            response.ok ? 'LinkedIn returned no calibration evidence.' : response.message,
          );
        }
        const parsed = calibrationCaptureSchema.parse(response.capture);
        if (!active) return;
        setCapture(parsed);
        if (requestMode === 'local') {
          setCandidate(parsed.localCandidate);
          setPhase('preview');
        } else {
          setPhase('evidence');
        }
      } catch (reason) {
        if (!active) return;
        const resolved = toAppError(reason);
        setError(resolved.message);
        setErrorCode(resolved.code);
        setPhase('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [aiSetupReady, appLoaded, requestFrameId, requestId, requestKind, requestMode, requestTabId]);

  useEffect(
    () => () => {
      if (requestId && requestTabId !== undefined && requestFrameId !== undefined) {
        void chrome.tabs
          .sendMessage(
            requestTabId,
            { type: 'content:clear-calibration' },
            { frameId: requestFrameId },
          )
          .catch(() => undefined);
      }
    },
    [requestFrameId, requestId, requestTabId],
  );

  if (!app || !session || !request) return null;

  const cancel = async () => {
    job.cancel();
    await chrome.tabs
      .sendMessage(
        request.tabId,
        { type: 'content:clear-calibration' },
        { frameId: request.frameId },
      )
      .catch(() => undefined);
    await storageRepository.updateSession((current) => ({
      ...current,
      calibration: { status: 'idle' },
    }));
    await refresh();
  };

  const openSetup = async () => {
    await storageRepository.updateSession((current) => ({
      ...current,
      activeTab: 'settings',
      calibration: { status: 'idle' },
    }));
    onOpenSettings();
  };

  const sendEvidence = () => {
    if (!capture) return;
    void job.run(async (signal) => {
      try {
        const result = await proposeLayoutCalibration(capture.evidence, request.kind, signal);
        let response: RuntimeResponse = await chrome.tabs.sendMessage(
          request.tabId,
          {
            type: 'content:validate-calibration',
            requestId: request.requestId,
            kind: request.kind,
            proposal: result.value,
          },
          { frameId: request.frameId },
        );
        let usedLocalFallback = false;
        if (!response.ok && response.code === 'unsupported-layout') {
          response = await chrome.tabs.sendMessage(
            request.tabId,
            {
              type: 'content:validate-calibration',
              requestId: request.requestId,
              kind: request.kind,
              proposal: capture.localCandidate.proposal,
            },
            { frameId: request.frameId },
          );
          usedLocalFallback = true;
        }
        if (!response.ok || !('candidate' in response)) {
          throw new AppError(
            'unsupported-layout',
            response.ok ? 'LinkedIn returned no calibration preview.' : response.message,
          );
        }
        setCandidate(calibrationCandidateSchema.parse(response.candidate));
        setFallbackNotice(
          usedLocalFallback
            ? 'The AI mapping included unrelated controls, so Thoughtline used the validated on-device mapping.'
            : result.usedFallback
              ? 'A fallback provider proposed this layout using the same reviewed evidence.'
              : null,
        );
        setPhase('preview');
        return result.value;
      } catch (reason) {
        const resolved = toAppError(reason);
        setError(resolved.message);
        setErrorCode(resolved.code);
        setPhase('error');
        throw reason;
      }
    });
  };

  const confirm = async () => {
    if (!candidate) return;
    setPhase('saving');
    try {
      const response: RuntimeResponse = await chrome.tabs.sendMessage(
        request.tabId,
        {
          type: 'content:validate-calibration',
          requestId: request.requestId,
          kind: request.kind,
          proposal: candidate.proposal,
        },
        { frameId: request.frameId },
      );
      if (!response.ok || !('candidate' in response)) {
        throw new AppError(
          'unsupported-layout',
          response.ok ? 'The calibration preview expired.' : response.message,
        );
      }
      const validated = calibrationCandidateSchema.parse(response.candidate);
      setCandidate(validated);
      if (validated.preview.persistent && !chrome.extension.inIncognitoContext) {
        await storageRepository.saveLayoutRecipe(validated.recipe);
      }
      setPhase('success');
    } catch (reason) {
      const resolved = toAppError(reason);
      setError(resolved.message);
      setErrorCode(resolved.code);
      setPhase('error');
    }
  };

  return (
    <div className="pt-4">
      <PageHeading
        title={request.mode === 'ai' ? 'Calibrate with AI' : 'Calibrate layout'}
        description={`Teach Thoughtline how this visible ${request.kind} is structured.`}
        compact
        action={<StatusBadge>{request.kind === 'post' ? 'Post' : 'Comment'}</StatusBadge>}
      />

      {phase === 'checking' ? (
        <CalibrationNotice
          icon={<HugeIcon icon={BracketsIcon} className="size-5" />}
          title="Reading the selected region"
          description="Thoughtline is building a bounded, visible DOM view around your right-click."
        />
      ) : null}

      {phase === 'setup' ? (
        <CalibrationNotice
          icon={<HugeIcon icon={CpuIcon} className="size-5" />}
          title="Finish AI setup first"
          description="AI calibration requires consent, three valid provider keys, the zero-cost route confirmation, and provider access. Right-click the item again after setup."
          actions={
            <>
              <Button variant="secondary" onClick={() => void cancel()}>
                Cancel
              </Button>
              <Button onClick={() => void openSetup()}>Review setup</Button>
            </>
          }
        />
      ) : null}

      {phase === 'evidence' && capture ? (
        <>
          <Card className="calibration-evidence-card overflow-hidden p-0">
            <div className="flex items-start gap-3 border-b border-[#b8d3cf] bg-proof-soft px-4 py-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-[#a7c8c3] bg-surface text-proof">
                <HugeIcon icon={ShieldCheckIcon} className="size-4" />
              </span>
              <div>
                <h3 className="font-display text-[16px] font-[680]">Review before sending</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  OpenRouter receives this evidence first. The identical evidence may be sent to
                  Gemini and then Groq if an earlier stage fails.
                </p>
              </div>
            </div>
            <div className="calibration-bracket m-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-xs">Visible evidence region</strong>
                <span className="font-utility text-[10px] text-proof">
                  {capture.evidence.nodeCount} nodes · {capture.evidence.characterCount} characters
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Includes the selected target, candidate ancestors, comparable visible siblings, and
                local geometry. Editable, hidden, and executable elements are excluded.
              </p>
              <details className="mt-3 rounded-lg border border-rule bg-soft">
                <summary className="cursor-pointer px-3 py-2 text-[11px] font-[650] text-primary">
                  Inspect exact evidence
                </summary>
                <pre className="max-h-52 overflow-auto border-t border-rule p-3 font-utility text-[9px] leading-relaxed text-muted">
                  {JSON.stringify(capture.evidence, null, 2)}
                </pre>
              </details>
            </div>
          </Card>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void cancel()}>
              Cancel
            </Button>
            <Button onClick={sendEvidence}>Send and calibrate</Button>
          </div>
        </>
      ) : null}

      {job.running ? (
        <CalibrationNotice
          icon={<HugeIcon icon={CpuIcon} className="size-5 animate-pulse" />}
          title="Identifying the layout"
          description="Gemini is proposing a structural recipe. Thoughtline will validate every returned node locally."
          actions={
            <Button variant="secondary" onClick={job.cancel}>
              Cancel request
            </Button>
          }
        />
      ) : null}

      {(phase === 'preview' || phase === 'saving') && candidate ? (
        <>
          {fallbackNotice ? (
            <div className="mb-3 rounded-lg border border-[#e1c789] bg-[#fff8e8] p-3 text-[11px] text-[#795713]">
              {fallbackNotice}
            </div>
          ) : null}
          <Card className="overflow-hidden p-0">
            <div className="flex items-start gap-3 border-b border-rule px-4 py-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-[#a7c8c3] bg-proof-soft text-proof">
                <HugeIcon icon={BracketsIcon} className="size-4" />
              </span>
              <div>
                <h3 className="font-display text-[16px] font-[680]">Confirm the visible item</h3>
                <p className="mt-1 text-[11px] text-muted">
                  The teal outline on LinkedIn must contain exactly this {request.kind}.
                </p>
              </div>
            </div>
            <div className="calibration-bracket m-4 space-y-3">
              <PreviewField label="Author" value={candidate.preview.author} />
              <PreviewField label="Primary text" value={candidate.preview.text} multiline />
              <div className="flex items-center justify-between border-t border-rule pt-3">
                <span className="text-[11px] text-muted">
                  {candidate.preview.validationCount} visible matching{' '}
                  {candidate.preview.validationCount === 1 ? 'example' : 'examples'}
                </span>
                <StatusBadge>
                  {candidate.preview.persistent ? 'Can be saved' : 'This item only'}
                </StatusBadge>
              </div>
            </div>
          </Card>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void cancel()} disabled={phase === 'saving'}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={phase === 'saving'}>
              {phase === 'saving' ? 'Confirming…' : 'Confirm layout'}
            </Button>
          </div>
        </>
      ) : null}

      {phase === 'success' && candidate ? (
        <CalibrationNotice
          icon={<HugeIcon icon={Tick02Icon} className="size-5" />}
          title={
            candidate.preview.persistent
              ? 'Layout saved on this device'
              : 'Layout ready for this item'
          }
          description={
            candidate.preview.persistent
              ? 'Thoughtline validated this structure against multiple visible examples. You can now draft a reply.'
              : 'Only one matching example was visible, so this repair lasts for the current LinkedIn item.'
          }
          actions={<Button onClick={() => void cancel()}>Done</Button>}
          success
        />
      ) : null}

      {phase === 'error' ? (
        <CalibrationNotice
          icon={<HugeIcon icon={Alert01Icon} className="size-5" />}
          title="Calibration could not finish"
          description={error}
          actions={
            <>
              <Button variant="secondary" onClick={() => void cancel()}>
                Close
              </Button>
              {capture && isProviderFailure(errorCode) ? (
                <Button
                  onClick={() => {
                    setCandidate(capture.localCandidate);
                    setError('');
                    setErrorCode(null);
                    setPhase('preview');
                  }}
                >
                  Use on-device result
                </Button>
              ) : (
                <Button onClick={() => void openSetup()}>Open settings</Button>
              )}
            </>
          }
        />
      ) : null}
    </div>
  );
}

function isProviderFailure(code: AppErrorCode | null): boolean {
  return (
    code === 'credential-invalid' ||
    code === 'provider-rate-limit' ||
    code === 'provider-response-invalid' ||
    code === 'provider-unavailable'
  );
}

function PreviewField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <span className="font-utility text-[10px] font-[650] uppercase tracking-[0.08em] text-proof">
        {label}
      </span>
      <p
        className={
          multiline
            ? 'mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-ink'
            : 'mt-1 text-[12px] font-[650] text-ink'
        }
      >
        {value}
      </p>
    </div>
  );
}

function CalibrationNotice({
  icon,
  title,
  description,
  actions,
  success = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  success?: boolean;
}) {
  return (
    <Card
      className={
        success
          ? 'border-[#a7c8c3] bg-[linear-gradient(180deg,var(--color-surface),var(--color-proof-soft))] p-5'
          : 'p-5'
      }
    >
      <span
        className={
          success
            ? 'grid size-10 place-items-center rounded-xl border border-[#a7c8c3] bg-surface text-proof'
            : 'grid size-10 place-items-center rounded-xl border border-rule bg-soft text-primary'
        }
      >
        {icon}
      </span>
      <h3 className="mt-4 font-display text-[18px] font-[680]">{title}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{description}</p>
      {actions ? <div className="mt-5 flex justify-end gap-2">{actions}</div> : null}
    </Card>
  );
}
