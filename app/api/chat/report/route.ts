import { chatInboxProxy } from "@/lib/chat-inbox-proxy";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => chatInboxProxy(request, "report");
