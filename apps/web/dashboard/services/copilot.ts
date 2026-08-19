import { api } from "@/services/api";

export type CopilotMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  workflow_id?: string | null;
  metadata?: { missing_fields?: string[]; intent?: string; dialogue_state?: string; choices?: Array<{value:string;label:string}>; summary?: Record<string, unknown>; tool?: string; cards?: Array<{kind:string;id:string;title:string;subtitle:string;href:string}> };
  created_at: string;
};

export type CopilotWorkflow = {
  id: string;
  source_message: string;
  client_phone: string;
  workflow_type: string;
  workflow_status: string;
  confidence: number;
  entities: Record<string, unknown>;
  proposed_actions: Array<{ type: string; label: string; payload: Record<string, unknown> }>;
  result_payload?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
};

export type CopilotEscalation = {
  id: string;
  client_phone?: string | null;
  message: string;
  intent?: string;
  escalation_reason?: string;
  decision?: string;
  created_at: string;
};

export async function getCopilotMessages() {
  const response = await api.get<{ messages: CopilotMessage[] }>("/ai/copilot/messages");
  return response.data.messages;
}

export async function sendCopilotMessage(message: string, clientPhone?: string) {
  const response = await api.post<{ message: CopilotMessage; workflow: CopilotWorkflow | null; missing_fields?: string[]; summary?: Record<string,unknown>; dialogue_state?: string }>("/ai/copilot/messages", {
    message,
    client_phone: clientPhone || null,
  });
  return response.data;
}

export async function getCopilotWorkflows() {
  const response = await api.get<{ workflows: CopilotWorkflow[] }>("/ai/copilot/workflows", {
    params: { workflow_status: null },
  });
  return response.data.workflows.filter((item) =>
    ["PREPARED", "FAILED", "EXECUTING"].includes(item.workflow_status),
  );
}

export async function approveCopilotWorkflow(workflowId: string) {
  return (await api.post(`/ai/copilot/workflows/${workflowId}/approve`)).data;
}

export async function rejectCopilotWorkflow(workflowId: string) {
  return (await api.post(`/ai/copilot/workflows/${workflowId}/reject`, {})).data;
}

export async function getCopilotEscalations() {
  const response = await api.get<{ escalations: CopilotEscalation[] }>("/ai/copilot/escalations");
  return response.data.escalations;
}

