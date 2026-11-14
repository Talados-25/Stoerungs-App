// Hintergrund-Prüfung – funktioniert NUR in einem Development-/Ad-hoc-Build,
// nicht in Expo Go. In Expo Go wird das hier einfach übersprungen.
import { isRunningInExpoGo } from 'expo';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { recordBackgroundRun, runChecks } from './monitor';

const TASK = 'stoerungs-check';

if (!isRunningInExpoGo()) {
  TaskManager.defineTask(TASK, async () => {
    try {
      await recordBackgroundRun();
      await runChecks();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundCheck(): Promise<boolean> {
  if (isRunningInExpoGo()) return false;
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 }); // Minuten; iOS entscheidet selbst
    }
    return true;
  } catch {
    return false;
  }
}
