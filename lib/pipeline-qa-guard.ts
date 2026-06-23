import { NextResponse } from "next/server";
import {
  buildQualityScanCliCommand,
  isQualityScanSpawnAllowed,
  qualityScanBlockedMessage,
  type QualityCliAction,
  type QualityCliOptions
} from "@/lib/pipeline-qa-policy";

export function rejectQualityScanSpawn(
  storyId: string,
  action: QualityCliAction,
  options: QualityCliOptions = {}
) {
  return NextResponse.json(
    {
      error: qualityScanBlockedMessage(),
      cliOnly: true,
      command: buildQualityScanCliCommand(storyId, action, options)
    },
    { status: 403 }
  );
}

export function assertQualityScanSpawnAllowed(
  storyId: string,
  action: QualityCliAction,
  options: QualityCliOptions = {}
) {
  if (isQualityScanSpawnAllowed()) return null;
  return rejectQualityScanSpawn(storyId, action, options);
}
