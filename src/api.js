const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3340";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

export function loginAdmin(email, password) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function listarTenants(token) {
  return request("/api/tenants", { token });
}

export function criarTenant(token, payload) {
  return request("/api/tenants", { method: "POST", token, body: JSON.stringify(payload) });
}

export function atualizarTenant(token, tenantId, payload) {
  return request(`/api/tenants/${tenantId}`, { method: "PUT", token, body: JSON.stringify(payload) });
}

export function alterarStatusTenant(token, tenantId, active) {
  return request(`/api/tenants/${tenantId}/status`, { method: "PATCH", token, body: JSON.stringify({ active }) });
}

export function atualizarCobrancaTenant(token, tenantId, payload) {
  return request(`/api/tenants/${tenantId}/billing`, { method: "PATCH", token, body: JSON.stringify(payload) });
}

export function consultarAcessoTenant(token, tenantId) {
  return request(`/api/tenants/${tenantId}/access`, { token });
}

export function excluirTenant(token, tenantId) {
  return request(`/api/tenants/${tenantId}`, { method: "DELETE", token });
}

export function listarUnidades(token, tenantId) {
  return request(`/api/tenants/${tenantId}/units`, { token });
}

export function criarUnidade(token, tenantId, payload) {
  return request(`/api/tenants/${tenantId}/units`, { method: "POST", token, body: JSON.stringify(payload) });
}

export function atualizarUnidade(token, tenantId, unitId, payload) {
  return request(`/api/tenants/${tenantId}/units/${unitId}`, { method: "PUT", token, body: JSON.stringify(payload) });
}

export function alterarStatusUnidade(token, tenantId, unitId, active) {
  return request(`/api/tenants/${tenantId}/units/${unitId}/status`, { method: "PATCH", token, body: JSON.stringify({ active }) });
}

export function excluirUnidade(token, tenantId, unitId) {
  return request(`/api/tenants/${tenantId}/units/${unitId}`, { method: "DELETE", token });
}

export function listarPlanos(token, productKey = "mesamanda") {
  return request(`/api/plans?productKey=${encodeURIComponent(productKey)}`, { token });
}

export function criarPlano(token, payload) {
  return request("/api/plans", { method: "POST", token, body: JSON.stringify(payload) });
}

export function atualizarPlano(token, planId, payload) {
  return request(`/api/plans/${planId}`, { method: "PUT", token, body: JSON.stringify(payload) });
}

export function alterarStatusPlano(token, planId, active) {
  return request(`/api/plans/${planId}/status`, { method: "PATCH", token, body: JSON.stringify({ active }) });
}

export function consultarAssinaturaTenant(token, tenantId) {
  return request(`/api/tenants/${tenantId}/subscription`, { token });
}

export function atribuirPlanoTenant(token, tenantId, payload) {
  return request(`/api/tenants/${tenantId}/subscription`, { method: "PUT", token, body: JSON.stringify(payload) });
}

export function listarProdutos(token) {
  return request("/api/products", { token });
}

export function criarProduto(token, payload) {
  return request("/api/products", { method: "POST", token, body: JSON.stringify(payload) });
}

export function atualizarProduto(token, productId, payload) {
  return request(`/api/products/${productId}`, { method: "PUT", token, body: JSON.stringify(payload) });
}

export function excluirProduto(token, productId) {
  return request(`/api/products/${productId}`, { method: "DELETE", token });
}
