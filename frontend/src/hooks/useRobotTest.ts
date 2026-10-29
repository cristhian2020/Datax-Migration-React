import { useState, useRef, useEffect, useCallback } from "react";

export type JobStatus =
  | "IDLE"
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT"
  | "CANCELLED";

export type TestType = "conversion" | "download";

export interface RunTestParams {
  robot_code: string;
  test_type: TestType;
  sample_file?: string;
  skip_text_match?: boolean;
  download_type?: string;
  updated_to?: string;
  timeout_seconds?: number;
  extra_env?: Record<string, string>;
}

export interface JobStatusResponse {
  job_id: string;
  robot_code: string;
  test_type: string;
  status: JobStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  exit_code: number | null;
  log_count: number;
  sqlite_created: boolean;
  sqlite_path: string | null;
  diagnostics: string[];
  metadata: Record<string, any>;
}

export interface UseRobotTestOptions {
  onLog?: (line: string) => void;
  onStatusChange?: (status: JobStatus, details?: JobStatusResponse) => void;
  onFinish?: (finalStatus: JobStatus, details?: JobStatusResponse) => void;
  baseUrl?: string;
}

export function useRobotTest(options: UseRobotTestOptions = {}) {
  const { onLog, onStatusChange, onFinish, baseUrl = "" } = options;

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>("IDLE");
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [jobDetails, setJobDetails] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // Limpieza segura de EventSource
  const cleanupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupEventSource();
    };
  }, [cleanupEventSource]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const reset = useCallback(() => {
    cleanupEventSource();
    setJobId(null);
    setStatus("IDLE");
    setLogs([]);
    setIsRunning(false);
    setDuration(null);
    setJobDetails(null);
    setError(null);
  }, [cleanupEventSource]);

  // Consulta de estado puntual REST
  const fetchStatus = useCallback(
    async (id: string): Promise<JobStatusResponse | null> => {
      try {
        const res = await fetch(`${baseUrl}/api/test/jobs/${id}/status`);
        if (!res.ok) return null;
        const data: JobStatusResponse = await res.json();
        setJobDetails(data);
        if (data.duration_seconds !== null) {
          setDuration(data.duration_seconds);
        }
        return data;
      } catch (err) {
        console.error("Error consultando estado del trabajo:", err);
        return null;
      }
    },
    [baseUrl]
  );

  // Iniciar ejecución y suscripción SSE
  const runTest = useCallback(
    async (params: RunTestParams): Promise<string | null> => {
      cleanupEventSource();
      setError(null);
      setLogs([]);
      setDuration(null);
      setJobDetails(null);
      setStatus("QUEUED");
      setIsRunning(true);

      try {
        // 1. Despachar petición HTTP POST no bloqueante (202 Accepted)
        const response = await fetch(`${baseUrl}/api/test/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.detail || `Error ${response.status} iniciando prueba.`;
          setError(errMsg);
          setStatus("FAILED");
          setIsRunning(false);
          if (onFinish) onFinish("FAILED");
          return null;
        }

        const data = await response.json();
        const newJobId: string = data.job_id;
        setJobId(newJobId);
        onStatusChange?.("QUEUED");

        // 2. Conectar stream de Server-Sent Events (SSE)
        const streamUrl = `${baseUrl}/api/test/jobs/${newJobId}/stream`;
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          if (!event.data) return;

          try {
            const parsed = JSON.parse(event.data);

            // A) Evento de Registro / Log en vivo o histórico
            if (parsed.type === "log" && parsed.data) {
              const line = String(parsed.data);
              setLogs((prev) => [...prev, line]);
              onLog?.(line);
            }

            // B) Evento de Cambio de Estado / Metadata
            else if (parsed.type === "status" && parsed.data) {
              const details: JobStatusResponse = parsed.data;
              const newStatus = details.status;
              setStatus(newStatus);
              setJobDetails(details);
              if (details.duration_seconds !== null) {
                setDuration(details.duration_seconds);
              }
              onStatusChange?.(newStatus, details);

              // Si llegó a estado terminal, desconectar stream
              if (
                newStatus === "SUCCESS" ||
                newStatus === "FAILED" ||
                newStatus === "TIMEOUT" ||
                newStatus === "CANCELLED"
              ) {
                setIsRunning(false);
                cleanupEventSource();
                onFinish?.(newStatus, details);
              }
            }

            // C) Evento de Cierre (Done)
            else if (parsed.type === "done") {
              setIsRunning(false);
              cleanupEventSource();
              // Asegurar lectura final de estado vía REST
              fetchStatus(newJobId).then((finalDetails) => {
                if (finalDetails) {
                  setStatus(finalDetails.status);
                  onFinish?.(finalDetails.status, finalDetails);
                }
              });
            }
          } catch (e) {
            console.warn("Mensaje SSE no JSON o heartbeat:", event.data);
          }
        };

        es.onerror = (err) => {
          console.warn("Evento onerror en SSE. Verificando estado del proceso...", err);
          // Si el EventSource se corta, consultar REST para ver si ya terminó
          fetchStatus(newJobId).then((curr) => {
            if (
              curr &&
              (curr.status === "SUCCESS" ||
                curr.status === "FAILED" ||
                curr.status === "TIMEOUT" ||
                curr.status === "CANCELLED")
            ) {
              setStatus(curr.status);
              setIsRunning(false);
              cleanupEventSource();
              onFinish?.(curr.status, curr);
            }
          });
        };

        return newJobId;
      } catch (err: any) {
        const msg = err.message || "Falla de red al conectar con el servidor de pruebas.";
        setError(msg);
        setStatus("FAILED");
        setIsRunning(false);
        onFinish?.("FAILED");
        return null;
      }
    },
    [baseUrl, cleanupEventSource, fetchStatus, onFinish, onLog, onStatusChange]
  );

  // Cancelar ejecución activa
  const cancelTest = useCallback(async (): Promise<boolean> => {
    if (!jobId) return false;

    try {
      const res = await fetch(`${baseUrl}/api/test/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (res.ok) {
        setStatus("CANCELLED");
        setIsRunning(false);
        cleanupEventSource();
        onStatusChange?.("CANCELLED");
        onFinish?.("CANCELLED");
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error al cancelar prueba:", err);
      return false;
    }
  }, [baseUrl, cleanupEventSource, jobId, onFinish, onStatusChange]);

  return {
    runTest,
    cancelTest,
    clearLogs,
    reset,
    jobId,
    status,
    logs,
    isRunning,
    isCompleted: ["SUCCESS", "FAILED", "TIMEOUT", "CANCELLED"].includes(status),
    isSuccess: status === "SUCCESS",
    isFailed: status === "FAILED",
    isTimeout: status === "TIMEOUT",
    isCancelled: status === "CANCELLED",
    duration,
    jobDetails,
    error,
    sqliteCreated: jobDetails?.sqlite_created ?? false,
    sqlitePath: jobDetails?.sqlite_path ?? null,
  };
}

