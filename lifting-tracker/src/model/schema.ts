import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const appWorkoutSchema = appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: 'workout_sessions',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'started_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'total_tonnage', type: 'number' },
        { name: 'total_reps', type: 'number' },
        { name: 'pr_count', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'session_exercises',
      columns: [
        { name: 'workout_session_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string' },
        { name: 'order_index', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'exercise_sets',
      columns: [
        { name: 'session_exercise_id', type: 'string', isIndexed: true },
        { name: 'set_index', type: 'number' },
        { name: 'set_type', type: 'string' },
        { name: 'weight', type: 'number' },
        { name: 'reps', type: 'number' },
        { name: 'is_completed', type: 'boolean' },
        { name: 'is_pr', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'routine_templates',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'routine_exercises',
      columns: [
        { name: 'routine_template_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string' },
        { name: 'order_index', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'body_measurements',
      columns: [
        { name: 'metric_type', type: 'string' },
        { name: 'value', type: 'number' },
        { name: 'logged_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'custom_exercises',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'muscle', type: 'string' },
        { name: 'equip', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});