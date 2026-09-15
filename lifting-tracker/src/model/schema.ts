import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const appWorkoutSchema = appSchema({
  version: 7,
  tables: [
    // 1. WORKOUT SESSIONS (Historical & Active)
    tableSchema({
      name: 'workout_sessions',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'status', type: 'string' }, // 'in_progress' | 'completed' | 'cancelled'
        { name: 'started_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'total_tonnage', type: 'number' },
        { name: 'total_reps', type: 'number' },
        { name: 'pr_count', type: 'number' },
        // Watch & Wearable Metrics
        { name: 'calories', type: 'number', isOptional: true },
        { name: 'avg_bpm', type: 'number', isOptional: true },
        { name: 'max_bpm', type: 'number', isOptional: true },
      ],
    }),

    // 2. SESSION EXERCISES (Movements within a workout)
    tableSchema({
      name: 'session_exercises',
      columns: [
        { name: 'workout_session_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string' },
        { name: 'order_index', type: 'number' },
      ],
    }),

    // 3. EXERCISE SETS (Individual sets logged per movement)
    tableSchema({
      name: 'exercise_sets',
      columns: [
        { name: 'session_exercise_id', type: 'string', isIndexed: true },
        { name: 'set_index', type: 'number' },
        { name: 'set_type', type: 'string' }, // 'normal' | 'warmup' | 'drop' | 'failure'
        { name: 'weight', type: 'number' },
        { name: 'reps', type: 'number' },
        { name: 'is_completed', type: 'boolean' },
        { name: 'is_pr', type: 'boolean' },
      ],
    }),

    // 4. ROUTINE TEMPLATES (Playlists)
    tableSchema({
      name: 'routine_templates',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // 5. ROUTINE EXERCISES (Movements assigned to a playlist)
    tableSchema({
      name: 'routine_exercises',
      columns: [
        { name: 'routine_template_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string' },
        { name: 'order_index', type: 'number' },
      ],
    }),

    // 6. BODY MEASUREMENTS (Weight, Arms, Chest, Waist tracking)
    tableSchema({
      name: 'body_measurements',
      columns: [
        { name: 'metric_type', type: 'string' }, // 'weight' | 'arms' | 'chest' | 'waist'
        { name: 'value', type: 'number' },
        { name: 'logged_at', type: 'number' },
      ],
    }),

    // 7. CUSTOM EXERCISES (With Primary & Secondary Anatomical Sub-Groups)
    tableSchema({
      name: 'custom_exercises',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'primary_muscle', type: 'string' },
        { name: 'primary_subgroup', type: 'string' },
        { name: 'secondary_muscles', type: 'string' }, // Serialized JSON array of MajorMuscle
        { name: 'secondary_subgroups', type: 'string' }, // Serialized JSON array of subgroup names
        { name: 'equip', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});