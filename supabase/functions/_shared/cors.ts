export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Max-Age': '86400',
}

export function newCorsResponse(body: string | null, init?: ResponseInit): Response {
  const responseInit = init ?? { status: body ? 200 : 204 };
  // Ensure headers is an object and merge corsHeaders
  const headers = new Headers(responseInit.headers); // Initialize Headers object
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  if (body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  responseInit.headers = headers; // Assign the Headers object back
  return new Response(body, responseInit);
}