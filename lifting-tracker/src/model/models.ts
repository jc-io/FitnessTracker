import { Model, Relation } from '@nozbe/watermelondb';
import { field, date, relation, children } from '@nozbe/watermelondb/decorators';

// ==========================================
// 1. WORKOUT SESSIONS (Historical & Active)
// ==========================================
export class WorkoutSession extends Model {
  static table = 'workout_sessions';

  static associations = {
    session_exercises: { type: 'has_many' as const, foreignKey: 'workout_session_id' },
  };

  @field('title') title!: string;
  @field('status') status!: 'in_progress' | 'completed' | 'cancelled';
  @date('started_at') startedAt!: Date;
  @date('ended_at') endedAt?: Date;
  @field('total_tonnage') totalTonnage!: number;
  @field('total_reps') totalReps!: number;
  @field('pr_count') prCount!: number;

  // Smartwatch & Wearable Metrics
  @field('calories') calories?: number;
  @field('avg_bpm') avgBpm?: number;
  @field('max_bpm') maxBpm?: number;

  @children('session_exercises') exercises!: any;
}

// ==========================================
// 2. SESSION EXERCISES (Movements in a session)
// ==========================================
export class SessionExercise extends Model {
  static table = 'session_exercises';

  static associations = {
    workout_sessions: { type: 'belongs_to' as const, key: 'workout_session_id' },
    exercise_sets: { type: 'has_many' as const, foreignKey: 'session_exercise_id' },
  };

  @field('workout_session_id') workoutSessionId!: string;
  @field('exercise_id') exerciseId!: string;
  @field('order_index') orderIndex!: number;

  @relation('workout_sessions', 'workout_session_id') workoutSession!: Relation<WorkoutSession>;
  @children('exercise_sets') sets!: any;
}

// ==========================================
// 3. EXERCISE SETS (Individual sets logged)
// ==========================================
export class ExerciseSet extends Model {
  static table = 'exercise_sets';

  static associations = {
    session_exercises: { type: 'belongs_to' as const, key: 'session_exercise_id' },
  };

  @field('session_exercise_id') sessionExerciseId!: string;
  @field('set_index') setIndex!: number;
  @field('set_type') setType!: 'normal' | 'warmup' | 'drop' | 'failure';
  @field('weight') weight!: number;
  @field('reps') reps!: number;
  @field('is_completed') isCompleted!: boolean;
  @field('is_pr') isPR!: boolean;

  @relation('session_exercises', 'session_exercise_id') sessionExercise!: Relation<SessionExercise>;
}

// ==========================================
// 4. ROUTINE TEMPLATES (Playlists)
// ==========================================
export class RoutineTemplate extends Model {
  static table = 'routine_templates';

  static associations = {
    routine_exercises: { type: 'has_many' as const, foreignKey: 'routine_template_id' },
  };

  @field('title') title!: string;
  @date('created_at') createdAt!: Date;

  @children('routine_exercises') exercises!: any;
}

// ==========================================
// 5. ROUTINE EXERCISES (Movements inside a playlist)
// ==========================================
export class RoutineExercise extends Model {
  static table = 'routine_exercises';

  static associations = {
    routine_templates: { type: 'belongs_to' as const, key: 'routine_template_id' },
  };

  @field('routine_template_id') routineTemplateId!: string;
  @field('exercise_id') exerciseId!: string;
  @field('order_index') orderIndex!: number;

  @relation('routine_templates', 'routine_template_id') routineTemplate!: Relation<RoutineTemplate>;
}

// ==========================================
// 6. BODY MEASUREMENTS
// ==========================================
export class BodyMeasurement extends Model {
  static table = 'body_measurements';

  @field('metric_type') metricType!: 'weight' | 'arms' | 'chest' | 'waist';
  @field('value') value!: number;
  @date('logged_at') loggedAt!: Date;
}

// ==========================================
// 7. CUSTOM EXERCISES
// ==========================================
export class CustomExercise extends Model {
  static table = 'custom_exercises';

  @field('name') name!: string;
  @field('primary_muscle') primaryMuscle!: string;
  @field('primary_subgroup') primarySubgroup!: string;
  @field('secondary_muscles') secondaryMuscles!: string; // JSON string array
  @field('secondary_subgroups') secondarySubgroups!: string; // JSON string array
  @field('equip') equip!: string;
  @date('created_at') createdAt!: Date;
}