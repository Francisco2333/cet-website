import { chatEndpoint, type AiConfig } from "./ai";

type CredentialStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const preferencesKey = "cet:ai-preferences";
const credentialsKey = "cet:ai-credentials:v1";
export const emptyAiConfig: AiConfig = { baseUrl: "", model: "", apiKey: "" };

export function readAiSettings(storage: CredentialStorage): { config: AiConfig; remember: boolean } {
  const preferences = JSON.parse(storage.getItem(preferencesKey) || "{}");
  if (!preferences || typeof preferences !== "object" || (preferences.version !== undefined && preferences.version !== 1)) throw new Error("AI 配置版本无法读取，请在设置中重新保存或清除。");
  const config = { baseUrl: typeof preferences.baseUrl === "string" ? preferences.baseUrl : "", model: typeof preferences.model === "string" ? preferences.model : "", apiKey: "" };
  const remember = preferences.remember === true;
  if (remember) {
    const credentials = JSON.parse(storage.getItem(credentialsKey) || "null");
    if (credentials) {
      if (credentials.version !== 1 || typeof credentials.apiKey !== "string" || credentials.baseUrl !== config.baseUrl || credentials.model !== config.model) throw new Error("已保存的 AI 凭据无法匹配，请重新保存或清除。");
      config.apiKey = credentials.apiKey;
    }
  } else storage.removeItem(credentialsKey);
  return { config, remember };
}

export function writeAiSettings(storage: CredentialStorage, config: AiConfig, remember: boolean): void {
  if (config.baseUrl) chatEndpoint(config.baseUrl);
  // 取消记住必须先删除凭据，即使普通偏好的后续写入失败也不保留 Key。
  storage.removeItem(credentialsKey);
  storage.setItem(preferencesKey, JSON.stringify({ version: 1, baseUrl: config.baseUrl, model: config.model, remember }));
  if (remember && config.apiKey) storage.setItem(credentialsKey, JSON.stringify({ version: 1, ...config }));
}

export function forgetAiKey(storage: CredentialStorage): void {
  storage.removeItem(credentialsKey);
  const raw = storage.getItem(preferencesKey);
  if (raw) {
    const preferences = JSON.parse(raw);
    storage.setItem(preferencesKey, JSON.stringify({ version: 1, baseUrl: typeof preferences?.baseUrl === "string" ? preferences.baseUrl : "", model: typeof preferences?.model === "string" ? preferences.model : "", remember: false }));
  }
}

export function clearAiSettings(storage: CredentialStorage): void {
  storage.removeItem(credentialsKey);
  storage.removeItem(preferencesKey);
}
