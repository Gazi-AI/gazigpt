export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const logo = "https://image2url.com/r2/default/images/1775496915249-8137449f-463e-4374-93ea-eb4b8c31cdc5.png";
  
  return new Response(JSON.stringify({
    logo: logo,
    context_limits: {
      "GaziGPT": 128000,
      "GaziGPT Extended": 128000,
      "GaziGPT Hyper": 384000
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
