export class PromptInterpolationError extends Error {
  constructor(
    public readonly promptFile: string,
    public readonly missingVars: string[],
  ) {
    super(
      `Prompt interpolation failed for "${promptFile}": missing ${missingVars.join(", ")}`,
    );
    this.name = "PromptInterpolationError";
  }
}

export class PromptResponseError extends Error {
  constructor(
    message: string,
    public readonly context: {
      promptFile: string;
      expectedToolName: string;
      stopReason?: string;
      contentTypes?: string[];
    },
  ) {
    super(message);
    this.name = "PromptResponseError";
  }
}
