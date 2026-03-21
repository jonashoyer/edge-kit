import { defineServiceIngress } from '../service-ingress';
import type {
  CheckAllResult,
  ReconcileAllResult,
} from './abstract-task-reconciler';

export type TaskReconcilerServiceIngressMode = 'check' | 'reconcile';

export type TaskReconcilerServiceIngressParams = {
  mode: TaskReconcilerServiceIngressMode;
  force?: boolean;
};

export type TaskReconcilerServiceIngressResult =
  | {
      mode: 'check';
      result: CheckAllResult;
    }
  | {
      mode: 'reconcile';
      result: ReconcileAllResult;
    };

type TaskReconcilerServiceIngressTarget = {
  checkAll(options?: { force?: boolean }): Promise<CheckAllResult>;
  reconcileAll(options?: { force?: boolean }): Promise<ReconcileAllResult>;
};

export const defineTaskReconcilerServiceIngress = (options: {
  reconciler: TaskReconcilerServiceIngressTarget;
  name?: string;
}) => {
  return defineServiceIngress<TaskReconcilerServiceIngressParams>({
    name: options.name ?? 'task-reconciler',
    async execute(params) {
      if (params.mode === 'check') {
        return {
          mode: 'check',
          result: await options.reconciler.checkAll({
            force: params.force,
          }),
        } satisfies TaskReconcilerServiceIngressResult;
      }

      return {
        mode: 'reconcile',
        result: await options.reconciler.reconcileAll({
          force: params.force,
        }),
      } satisfies TaskReconcilerServiceIngressResult;
    },
  });
};
