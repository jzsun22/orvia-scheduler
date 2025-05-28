export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Max-Age': '86400',
}

export function newCorsResponse(body: string | null, init?: ResponseInit): Response {
  const responseInit = init ?? { status: body ? 200 : 204 }; 
  responseInit.headers = { ...corsHeaders, ...responseInit.headers };
  if (body && !responseInit.headers['Content-Type']) {
    responseInit.headers['Content-Type'] = 'application/json';
  }
  return new Response(body, responseInit);
} 