import { deleteTaskFile, uploadTaskFiles } from "@/lib/task-files-proxy";

export const dynamic = "force-dynamic";
export const POST = uploadTaskFiles;
export const DELETE = deleteTaskFile;
