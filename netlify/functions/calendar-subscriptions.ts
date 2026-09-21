// Retired subscription endpoint; no database access.
export default async (): Promise<Response> => new Response(JSON.stringify({ error:'Assinaturas descontinuadas. Baixe o arquivo ICS na Minha Agenda.' }), { status:410, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } })
