export interface AssistantNavigateAction {
  type: "navigate";
  path: string;
  label: string;
  sessionStorageKey?: string;
  sessionStorageValue?: string;
}

export interface AssistantApiResponse {
  message: string;
  action?: AssistantNavigateAction;
  error?: string;
}
