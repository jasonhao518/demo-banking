import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { OpenAI } from "openai";
import { NextRequest } from "next/server";
import { FEDEX_MSA } from "@/lib/fake-msa";
import { PERMISSIONS } from "../v1/permissions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const llmAdapter = new OpenAIAdapter({
  openai,
  model: "gpt-4o",
});

const runtime = new CopilotRuntime({
  actions: ({ properties }) => {
    if (!PERMISSIONS.READ_MSA.includes(properties.userRole)) {
      return [];
    }
    return [
      {
        name: "queryVendorMSA",
        description:
          "Query MSA documents for a specific vendor. Call this if the user has any question specific to a vendor.",
        parameters: [
          {
            name: "vendorName",
          },
        ],
        handler() {
          return FEDEX_MSA;
        },
      },
    ];
  },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: llmAdapter,
    endpoint: "/api/copilotkit",
  });

  let response = await handleRequest(req);

  // Clone response if necessary
  response = new Response(response.body, response);

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-copilotkit-runtime-client-gql-version"
  );

  return response;
};

// Handle preflight OPTIONS request
export const OPTIONS = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-copilotkit-runtime-client-gql-version",
    },
  });
};
