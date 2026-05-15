import { useEffect, useRef } from "react";
import type { UserAccount } from "../../types/global";
import { friendlyError, withTimeout } from "../lib/api";
import { useToast } from "../../components/Toast";

const SCANNER_CHAR_TIMEOUT_MS = 85;
const SCANNER_MIN_LENGTH = 4;
const SCANNER_MAX_DURATION_MS = 1200;
const REPEAT_SCAN_COOLDOWN_MS = 1500;

function sanitizeQrInput(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function printableKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.altKey || event.metaKey) return "";
  return event.key.length === 1 ? event.key : "";
}

export function useGlobalQrAttendanceScanner({ user, enabled, onRecorded }: { user: UserAccount | null; enabled: boolean; onRecorded: () => Promise<void> | void }) {
  const toast = useToast();
  const bufferRef = useRef("");
  const firstAtRef = useRef(0);
  const lastAtRef = useRef(0);
  const recentScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const recordingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !user || user.role === "SuperAdmin") return undefined;
    const currentUser = user;

    async function processScan(rawCode: string) {
      const code = sanitizeQrInput(rawCode);
      if (!code || recordingRef.current) return;
      const now = Date.now();
      if (recentScanRef.current.code === code && now - recentScanRef.current.at < REPEAT_SCAN_COOLDOWN_MS) return;
      recentScanRef.current = { code, at: now };
      recordingRef.current = true;
      try {
        const result = await withTimeout(window.talyer.recordMechanicAttendance({ actorId: currentUser.id, qrCode: code }), "recording attendance");
        toast?.notify("success", `${result.action} recorded successfully for ${result.mechanicName}.`);
        await onRecorded();
      } catch (caught) {
        toast?.notify("error", friendlyError(caught, "Invalid mechanic QR."));
      } finally {
        recordingRef.current = false;
      }
    }

    function resetBuffer() {
      bufferRef.current = "";
      firstAtRef.current = 0;
      lastAtRef.current = 0;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const now = Date.now();
      if (event.key === "Enter") {
        const code = bufferRef.current;
        const duration = now - firstAtRef.current;
        const averageGap = code.length > 1 ? duration / Math.max(1, code.length - 1) : duration;
        const scannerLike = code.length >= SCANNER_MIN_LENGTH && duration <= SCANNER_MAX_DURATION_MS && averageGap <= SCANNER_CHAR_TIMEOUT_MS;
        resetBuffer();
        if (scannerLike) {
          event.preventDefault();
          void processScan(code);
        }
        return;
      }

      const key = printableKey(event);
      if (!key) return;
      if (!bufferRef.current || now - lastAtRef.current > SCANNER_CHAR_TIMEOUT_MS) {
        bufferRef.current = key;
        firstAtRef.current = now;
      } else {
        bufferRef.current += key;
      }
      lastAtRef.current = now;
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onRecorded, toast, user]);
}
