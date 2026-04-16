"use client";

import { Check } from "lucide-react";
import { ConverterStep } from "@/types/converter";
import { cn } from "@/lib/utils";

interface Props {
  currentStep: ConverterStep;
}

const STEPS: { number: ConverterStep; label: string }[] = [
  { number: 1, label: "Connect WordPress" },
  { number: 2, label: "Upload Files" },
  { number: 3, label: "Convert" },
  { number: 4, label: "Deploy" },
];

export default function StepIndicator({ currentStep }: Props) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center min-w-max px-4 py-6 mx-auto max-w-3xl">
        {STEPS.map((step, index) => {
          const isDone = step.number < currentStep;
          const isActive = step.number === currentStep;

          return (
            <div key={step.number} className="flex items-center">
              {/* Circle + label */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                    isDone &&
                      "bg-primary border-primary text-primary-foreground",
                    isActive &&
                      "bg-primary border-primary text-primary-foreground",
                    !isDone &&
                      !isActive &&
                      "bg-background border-muted-foreground/40 text-muted-foreground"
                  )}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" strokeWidth={3} />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    isActive && "text-primary font-medium",
                    !isActive && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line between steps */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-16 mx-2 mb-5",
                    isDone
                      ? "bg-primary"
                      : "border-t-2 border-dashed border-muted-foreground/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
