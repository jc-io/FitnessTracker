import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appWorkoutSchema } from './src/model/schema';
import {
  WorkoutSession,
  SessionExercise,
  ExerciseSet,
  RoutineTemplate,
  RoutineExercise,
  BodyMeasurement,
} from './src/model/models';

const adapter = new SQLiteAdapter({
  schema: appWorkoutSchema,
  jsi: true,
  onSetUpError: (error) => console.error('Database setup failed:', error),
});

export const database = new Database({
  adapter,
  modelClasses: [
    WorkoutSession,
    SessionExercise,
    ExerciseSet,
    RoutineTemplate,
    RoutineExercise,
    BodyMeasurement,
  ],
});

const PRESET_EXERCISES = [
  { id: 'bench_press', name: 'Bench Press (Barbell)', muscle: 'Chest', equip: 'Barbell' },
  { id: 'squat', name: 'Squat (Barbell)', muscle: 'Legs', equip: 'Barbell' },
  { id: 'deadlift', name: 'Deadlift (Barbell)', muscle: 'Back', equip: 'Barbell' },
  { id: 'overhead_press', name: 'Overhead Press (Barbell)', muscle: 'Shoulders', equip: 'Barbell' },
  { id: 'lat_pulldown', name: 'Lat Pulldown (Cable)', muscle: 'Back', equip: 'Cable' },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', muscle: 'Chest', equip: 'Dumbbell' },
  { id: 'barbell_curl', name: 'Barbell Bicep Curl', muscle: 'Arms', equip: 'Barbell' },
  { id: 'tricep_pushdown', name: 'Triceps Rope Pushdown', muscle: 'Arms', equip: 'Cable' },
  { id: 'leg_press', name: 'Leg Press (Machine)', muscle: 'Legs', equip: 'Machine' },
  { id: 'cable_fly', name: 'Cable Chest Fly', muscle: 'Chest', equip: 'Cable' },
];

type SetType = 'warmup' | 'normal' | 'drop' | 'failure';
type TabName = 'home' | 'workout' | 'profile';
type ProfileSubTab = 'statistics' | 'calendar' | 'measurements' | 'exercises';
type TimeHorizon = 'month' | 'year' | 'all';
type MetricType = 'volume' | 'duration' | 'reps';

interface RoutineWithExercises {
  template: RoutineTemplate;
  exercises: string[];
}

interface CompletedSessionDetails {
  session: WorkoutSession;
  exercises: {
    name: string;
    sets: ExerciseSet[];
  }[];
}

interface ChartBucket {
  label: string;
  value: number;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabName>('profile');
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>('statistics');

  // Graph state controls
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('month');
  const [activeMetric, setActiveMetric] = useState<MetricType>('volume');

  // Active workout
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>([]);
  const [setsByExercise, setSetsByExercise] = useState<{ [key: string]: ExerciseSet[] }>({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);

  // Playlists (Create & Edit)
  const [routines, setRoutines] = useState<RoutineWithExercises[]>([]);
  const [routineModalVisible, setRoutineModalVisible] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [routineNameInput, setRoutineNameInput] = useState('');
  const [selectedExercisesForRoutine, setSelectedExercisesForRoutine] = useState<string[]>([]);

  // Completed workouts & Measurements
  const [historyList, setHistoryList] = useState<CompletedSessionDetails[]>([]);
  const [expandedSessionIds, setExpandedSessionIds] = useState<{ [key: string]: boolean }>({});
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [metricChoice, setMetricChoice] = useState<'weight' | 'arms' | 'chest' | 'waist'>('weight');
  const [metricValue, setMetricValue] = useState('');
  const [addMeasurementModal, setAddMeasurementModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      const active = await database
        .get<WorkoutSession>('workout_sessions')
        .query(Q.where('status', 'in_progress'), Q.sortBy('started_at', Q.desc), Q.take(1))
        .fetch();

      if (active.length > 0) {
        setActiveSession(active[0]);
        await loadExercisesForSession(active[0]);
      }
      await loadWorkoutHistory();
      await loadRoutines();
      await loadMeasurements();
    }
    loadData();
  }, []);

  useEffect(() => {
    if (activeSession) {
      const startMs = activeSession.startedAt.getTime();
      const interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedSeconds(0);
    }
  }, [activeSession]);

  useEffect(() => {
    if (restRemaining === null || restRemaining <= 0) return;
    const interval = setInterval(() => {
      setRestRemaining((prev) => (prev === null || prev <= 1 ? null : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [restRemaining]);

  async function loadWorkoutHistory() {
    try {
      const completedSessions = await database
        .get<WorkoutSession>('workout_sessions')
        .query(Q.where('status', 'completed'), Q.sortBy('ended_at', Q.desc))
        .fetch();

      const detailsList: CompletedSessionDetails[] = [];
      for (const session of completedSessions) {
        const exercises = await database
          .get<SessionExercise>('session_exercises')
          .query(Q.where('workout_session_id', session.id), Q.sortBy('order_index', Q.asc))
          .fetch();

        const exerciseItems: { name: string; sets: ExerciseSet[] }[] = [];
        for (const ex of exercises) {
          const sets = await database
            .get<ExerciseSet>('exercise_sets')
            .query(Q.where('session_exercise_id', ex.id), Q.sortBy('set_index', Q.asc))
            .fetch();
          exerciseItems.push({ name: ex.exerciseId, sets });
        }
        detailsList.push({ session, exercises: exerciseItems });
      }
      setHistoryList(detailsList);
    } catch (e) {
      console.error('History load error:', e);
    }
  }

  async function loadRoutines() {
    try {
      const templates = await database
        .get<RoutineTemplate>('routine_templates')
        .query(Q.sortBy('created_at', Q.desc))
        .fetch();

      const routineList: RoutineWithExercises[] = [];
      for (const tmpl of templates) {
        const rExercises = await database
          .get<RoutineExercise>('routine_exercises')
          .query(Q.where('routine_template_id', tmpl.id), Q.sortBy('order_index', Q.asc))
          .fetch();

        routineList.push({
          template: tmpl,
          exercises: rExercises.map((e) => e.exerciseId),
        });
      }
      setRoutines(routineList);
    } catch (e) {
      console.error('Routines load error:', e);
    }
  }

  async function loadMeasurements() {
    try {
      const items = await database
        .get<BodyMeasurement>('body_measurements')
        .query(Q.sortBy('logged_at', Q.desc))
        .fetch();
      setMeasurements(items);
    } catch (e) {
      console.error('Measurements error:', e);
    }
  }

  function handleOpenCreateModal() {
    setEditingRoutineId(null);
    setRoutineNameInput('');
    setSelectedExercisesForRoutine([]);
    setRoutineModalVisible(true);
  }

  function handleOpenEditModal(routine: RoutineWithExercises) {
    setEditingRoutineId(routine.template.id);
    setRoutineNameInput(routine.template.title);
    setSelectedExercisesForRoutine([...routine.exercises]);
    setRoutineModalVisible(true);
  }

  async function handleSaveRoutine() {
    if (!routineNameInput.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this playlist.');
      return;
    }
    if (selectedExercisesForRoutine.length === 0) {
      Alert.alert('Exercises Required', 'Please select at least one exercise.');
      return;
    }

    await database.write(async () => {
      if (editingRoutineId) {
        const template = await database.get<RoutineTemplate>('routine_templates').find(editingRoutineId);
        await template.update((rec) => {
          rec.title = routineNameInput.trim();
        });

        const existingExercises = await database
          .get<RoutineExercise>('routine_exercises')
          .query(Q.where('routine_template_id', editingRoutineId))
          .fetch();

        for (const re of existingExercises) {
          await re.destroyPermanently();
        }

        for (let i = 0; i < selectedExercisesForRoutine.length; i++) {
          await database.get<RoutineExercise>('routine_exercises').create((rec) => {
            rec.routineTemplateId = editingRoutineId;
            rec.exerciseId = selectedExercisesForRoutine[i];
            rec.orderIndex = i + 1;
          });
        }
      } else {
        const template = await database.get<RoutineTemplate>('routine_templates').create((rec) => {
          rec.title = routineNameInput.trim();
          rec.createdAt = new Date();
        });

        for (let i = 0; i < selectedExercisesForRoutine.length; i++) {
          await database.get<RoutineExercise>('routine_exercises').create((rec) => {
            rec.routineTemplateId = template.id;
            rec.exerciseId = selectedExercisesForRoutine[i];
            rec.orderIndex = i + 1;
          });
        }
      }
    });

    setRoutineModalVisible(false);
    setEditingRoutineId(null);
    setRoutineNameInput('');
    setSelectedExercisesForRoutine([]);
    await loadRoutines();
  }

  function confirmDeleteRoutine(routineId: string) {
    Alert.alert('Delete Routine', 'Are you sure you want to remove this playlist?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            const tmpl = await database.get<RoutineTemplate>('routine_templates').find(routineId);
            const rExercises = await database
              .get<RoutineExercise>('routine_exercises')
              .query(Q.where('routine_template_id', routineId))
              .fetch();

            for (const re of rExercises) {
              await re.destroyPermanently();
            }
            await tmpl.destroyPermanently();
          });
          await loadRoutines();
        },
      },
    ]);
  }

  async function handleStartWorkoutFromRoutine(routine: RoutineWithExercises) {
    await database.write(async () => {
      const newSession = await database.get<WorkoutSession>('workout_sessions').create((record) => {
        record.title = routine.template.title;
        record.status = 'in_progress';
        record.startedAt = new Date();
        record.totalTonnage = 0;
        record.totalReps = 0;
        record.prCount = 0;
      });

      const loadedSessionExercises: SessionExercise[] = [];
      const setsMap: { [key: string]: ExerciseSet[] } = {};

      for (let i = 0; i < routine.exercises.length; i++) {
        const exName = routine.exercises[i];
        const newEx = await database.get<SessionExercise>('session_exercises').create((rec) => {
          rec.workoutSessionId = newSession.id;
          rec.exerciseId = exName;
          rec.orderIndex = i + 1;
        });

        const firstSet = await database.get<ExerciseSet>('exercise_sets').create((rec) => {
          rec.sessionExerciseId = newEx.id;
          rec.setIndex = 1;
          rec.setType = 'normal';
          rec.weight = 0;
          rec.reps = 0;
          rec.isCompleted = false;
          rec.isPR = false;
        });

        loadedSessionExercises.push(newEx);
        setsMap[newEx.id] = [firstSet];
      }

      setActiveSession(newSession);
      setSessionExercises(loadedSessionExercises);
      setSetsByExercise(setsMap);
    });
    setCurrentTab('workout');
  }

  async function handleStartEmptyWorkout() {
    await database.write(async () => {
      const newSession = await database.get<WorkoutSession>('workout_sessions').create((record) => {
        record.title = 'Empty Workout';
        record.status = 'in_progress';
        record.startedAt = new Date();
        record.totalTonnage = 0;
        record.totalReps = 0;
        record.prCount = 0;
      });
      setActiveSession(newSession);
      setSessionExercises([]);
      setSetsByExercise({});
    });
  }

  async function loadExercisesForSession(session: WorkoutSession) {
    const exercises = await database
      .get<SessionExercise>('session_exercises')
      .query(Q.where('workout_session_id', session.id), Q.sortBy('order_index', Q.asc))
      .fetch();

    setSessionExercises(exercises);

    const setsMap: { [key: string]: ExerciseSet[] } = {};
    for (const ex of exercises) {
      const sets = await database
        .get<ExerciseSet>('exercise_sets')
        .query(Q.where('session_exercise_id', ex.id), Q.sortBy('set_index', Q.asc))
        .fetch();
      setsMap[ex.id] = sets;
    }
    setSetsByExercise(setsMap);
  }

  async function handleAddExercise(exerciseName: string) {
    if (!activeSession) return;
    setPickerVisible(false);

    await database.write(async () => {
      const newSessionEx = await database.get<SessionExercise>('session_exercises').create((record) => {
        record.workoutSessionId = activeSession.id;
        record.exerciseId = exerciseName;
        record.orderIndex = sessionExercises.length + 1;
      });

      const firstSet = await database.get<ExerciseSet>('exercise_sets').create((record) => {
        record.sessionExerciseId = newSessionEx.id;
        record.setIndex = 1;
        record.setType = 'normal';
        record.weight = 0;
        record.reps = 0;
        record.isCompleted = false;
        record.isPR = false;
      });

      setSessionExercises((prev) => [...prev, newSessionEx]);
      setSetsByExercise((prev) => ({
        ...prev,
        [newSessionEx.id]: [firstSet],
      }));
    });
  }

  async function handleAddSet(sessionExId: string) {
    const existingSets = setsByExercise[sessionExId] || [];
    const nextIndex = existingSets.length + 1;
    const lastSet = existingSets[existingSets.length - 1];

    await database.write(async () => {
      const newSet = await database.get<ExerciseSet>('exercise_sets').create((record) => {
        record.sessionExerciseId = sessionExId;
        record.setIndex = nextIndex;
        record.setType = 'normal';
        record.weight = lastSet ? lastSet.weight : 0;
        record.reps = lastSet ? lastSet.reps : 0;
        record.isCompleted = false;
        record.isPR = false;
      });

      setSetsByExercise((prev) => ({
        ...prev,
        [sessionExId]: [...(prev[sessionExId] || []), newSet],
      }));
    });
  }

  async function handleCycleSetType(sessionExId: string, setItem: ExerciseSet) {
    const sequence: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
    const currentIdx = sequence.indexOf((setItem.setType as SetType) || 'normal');
    const nextType = sequence[(currentIdx + 1) % sequence.length];

    await database.write(async () => {
      await setItem.update((rec) => {
        rec.setType = nextType;
      });
    });

    setSetsByExercise((prev) => ({
      ...prev,
      [sessionExId]: prev[sessionExId].map((s) => (s.id === setItem.id ? setItem : s)),
    }));
  }

  async function handleUpdateField(
    sessionExId: string,
    setId: string,
    field: 'weight' | 'reps',
    val: string
  ) {
    const numVal = parseFloat(val) || 0;
    const targetSet = setsByExercise[sessionExId]?.find((s) => s.id === setId);
    if (!targetSet) return;

    await database.write(async () => {
      await targetSet.update((record) => {
        if (field === 'weight') record.weight = numVal;
        if (field === 'reps') record.reps = Math.floor(numVal);
      });
    });

    setSetsByExercise((prev) => ({
      ...prev,
      [sessionExId]: prev[sessionExId].map((s) => (s.id === setId ? targetSet : s)),
    }));
  }

  async function handleToggleComplete(sessionExId: string, setId: string) {
    if (!activeSession) return;
    const targetSet = setsByExercise[sessionExId]?.find((s) => s.id === setId);
    if (!targetSet) return;

    const willComplete = !targetSet.isCompleted;

    await database.write(async () => {
      await targetSet.update((record) => {
        record.isCompleted = willComplete;
      });

      const allSets = await database
        .get<ExerciseSet>('exercise_sets')
        .query(Q.where('is_completed', true))
        .fetch();

      let tonnage = 0;
      let totalReps = 0;
      for (const s of allSets) {
        tonnage += (s.weight || 0) * (s.reps || 0);
        totalReps += s.reps || 0;
      }

      await activeSession.update((record) => {
        record.totalTonnage = tonnage;
        record.totalReps = totalReps;
      });
    });

    setSetsByExercise((prev) => ({
      ...prev,
      [sessionExId]: prev[sessionExId].map((s) => (s.id === setId ? targetSet : s)),
    }));

    if (willComplete) {
      setRestRemaining(90);
    }
  }

  async function handleFinishWorkout() {
    if (!activeSession) return;

    Alert.alert('Finish Workout', 'Save this workout to your history?', [
      { text: 'Resume', style: 'cancel' },
      {
        text: 'Finish',
        style: 'default',
        onPress: async () => {
          await database.write(async () => {
            await activeSession.update((record) => {
              record.status = 'completed';
              record.endedAt = new Date();
            });
          });
          setActiveSession(null);
          setSessionExercises([]);
          setSetsByExercise({});
          setRestRemaining(null);
          await loadWorkoutHistory();
          setCurrentTab('home');
        },
      },
    ]);
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatDisplayDate(date: Date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function computeSessionDuration(start: Date, end?: Date) {
    if (!end) return '—';
    const diffSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const mins = Math.floor(diffSec / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins} min`;
  }

  function getDurationInMinutes(start: Date, end?: Date) {
    if (!end) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));
  }

  // ============================================================
  // BAR GRAPH DATA ENGINE
  // ============================================================
  const graphData: ChartBucket[] = useMemo(() => {
    const now = new Date();

    const getMetricVal = (item: CompletedSessionDetails): number => {
      if (activeMetric === 'volume') return item.session.totalTonnage || 0;
      if (activeMetric === 'duration') return getDurationInMinutes(item.session.startedAt, item.session.endedAt);
      if (activeMetric === 'reps') return item.session.totalReps || 0;
      return 0;
    };

    if (timeHorizon === 'month') {
      // 4 Weekly Buckets across the last 28 days
      const buckets: ChartBucket[] = [
        { label: 'W-3', value: 0 },
        { label: 'W-2', value: 0 },
        { label: 'Last Wk', value: 0 },
        { label: 'This Wk', value: 0 },
      ];

      historyList.forEach((item) => {
        const diffDays = Math.floor((now.getTime() - item.session.startedAt.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) buckets[3].value += getMetricVal(item);
        else if (diffDays >= 7 && diffDays < 14) buckets[2].value += getMetricVal(item);
        else if (diffDays >= 14 && diffDays < 21) buckets[1].value += getMetricVal(item);
        else if (diffDays >= 21 && diffDays < 28) buckets[0].value += getMetricVal(item);
      });

      return buckets;
    }

    if (timeHorizon === 'year') {
      // 12 Monthly Buckets (Past 12 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const buckets: ChartBucket[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
          label: monthNames[d.getMonth()],
          value: 0,
        });
      }

      historyList.forEach((item) => {
        const sessionDate = item.session.startedAt;
        for (let i = 0; i < 12; i++) {
          const target = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
          if (
            sessionDate.getFullYear() === target.getFullYear() &&
            sessionDate.getMonth() === target.getMonth()
          ) {
            buckets[i].value += getMetricVal(item);
            break;
          }
        }
      });

      return buckets;
    }

    // ALL TIME (Grouped by Year)
    const yearMap = new Map<number, number>();
    const currentYear = now.getFullYear();

    // Ensure at least the last 3 years exist in buckets
    for (let y = currentYear - 2; y <= currentYear; y++) {
      yearMap.set(y, 0);
    }

    historyList.forEach((item) => {
      const yr = item.session.startedAt.getFullYear();
      const current = yearMap.get(yr) || 0;
      yearMap.set(yr, current + getMetricVal(item));
    });

    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
    return sortedYears.map((yr) => ({
      label: String(yr),
      value: yearMap.get(yr) || 0,
    }));
  }, [historyList, timeHorizon, activeMetric]);

  const maxChartValue = useMemo(() => {
    const max = Math.max(...graphData.map((d) => d.value), 0);
    return max === 0 ? 100 : max;
  }, [graphData]);

  const totalAggregatedMetric = useMemo(() => {
    return graphData.reduce((acc, curr) => acc + curr.value, 0);
  }, [graphData]);

  const metricUnitLabel = useMemo(() => {
    if (activeMetric === 'volume') return 'lbs';
    if (activeMetric === 'duration') return 'min';
    return 'reps';
  }, [activeMetric]);

  const totalVolumeAllTime = historyList.reduce((acc, h) => acc + (h.session.totalTonnage || 0), 0);
  const totalWorkoutsCount = historyList.length;
  const totalRepsAllTime = historyList.reduce((acc, h) => acc + (h.session.totalReps || 0), 0);

  const currentMonthDays = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const isCompleted = historyList.some(
      (h) => h.session.startedAt.toDateString() === d.toDateString()
    );
    return { date: d, dayNum: d.getDate(), hasTrained: isCompleted };
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {activeSession && currentTab !== 'workout' && (
        <TouchableOpacity
          style={styles.activeBannerSticky}
          onPress={() => setCurrentTab('workout')}
        >
          <View style={styles.activeBannerDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.activeBannerTitle}>Workout in Progress</Text>
            <Text style={styles.activeBannerSub}>
              {formatTime(elapsedSeconds)} • {activeSession.title}
            </Text>
          </View>
          <Text style={styles.activeBannerReturn}>Resume ›</Text>
        </TouchableOpacity>
      )}

      <View style={{ flex: 1 }}>
        {/* ============================================================ */}
        {/* HOME TAB                                                     */}
        {/* ============================================================ */}
        {currentTab === 'home' && (
          <View style={{ flex: 1 }}>
            <View style={styles.homeHeader}>
              <Text style={styles.mainTitle}>Activity Feed</Text>
              <Text style={styles.subTitle}>{historyList.length} total logged sessions</Text>
            </View>

            <ScrollView style={styles.screenScroll} contentContainerStyle={{ paddingBottom: 100 }}>
              {historyList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>🏋️</Text>
                  <Text style={styles.emptyTitle}>No workouts recorded yet</Text>
                  <Text style={styles.emptyDesc}>
                    Start an empty workout or playlist from the Workout tab.
                  </Text>
                  <TouchableOpacity
                    style={styles.actionBtnSmall}
                    onPress={() => setCurrentTab('workout')}
                  >
                    <Text style={styles.actionBtnSmallText}>Go to Workout Tab</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                historyList.map(({ session, exercises }) => {
                  const isExpanded = !!expandedSessionIds[session.id];
                  const totalSets = exercises.reduce((sum, e) => sum + e.sets.length, 0);

                  return (
                    <View key={session.id} style={styles.historyCard}>
                      <TouchableOpacity
                        style={styles.cardHeaderRow}
                        activeOpacity={0.7}
                        onPress={() =>
                          setExpandedSessionIds((prev) => ({
                            ...prev,
                            [session.id]: !prev[session.id],
                          }))
                        }
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardWorkoutTitle}>{session.title}</Text>
                          <Text style={styles.cardWorkoutDate}>
                            {formatDisplayDate(session.startedAt)}
                          </Text>
                        </View>
                        <Text style={styles.expandChevron}>{isExpanded ? '▲' : '▼'}</Text>
                      </TouchableOpacity>

                      <View style={styles.statsStrip}>
                        <View style={styles.statCell}>
                          <Text style={styles.statCellValue}>
                            {computeSessionDuration(session.startedAt, session.endedAt)}
                          </Text>
                          <Text style={styles.statCellLabel}>Duration</Text>
                        </View>
                        <View style={styles.statCell}>
                          <Text style={styles.statCellValue}>
                            {session.totalTonnage.toLocaleString()} lbs
                          </Text>
                          <Text style={styles.statCellLabel}>Volume</Text>
                        </View>
                        <View style={styles.statCell}>
                          <Text style={styles.statCellValue}>{totalSets}</Text>
                          <Text style={styles.statCellLabel}>Sets</Text>
                        </View>
                      </View>

                      {isExpanded ? (
                        <View style={styles.expandedSection}>
                          {exercises.map((ex, idx) => (
                            <View key={idx} style={styles.expandedExerciseBlock}>
                              <Text style={styles.expandedExTitle}>{ex.name}</Text>
                              {ex.sets.map((s) => (
                                <View key={s.id} style={styles.expandedSetRow}>
                                  <Text style={styles.setIndexMuted}>Set {s.setIndex}</Text>
                                  <Text style={styles.setWeightReps}>
                                    {s.weight > 0 ? `${s.weight} lbs` : 'BW'} × {s.reps} reps
                                  </Text>
                                  {s.setType !== 'normal' && (
                                    <Text style={styles.badgeTag}>{s.setType.toUpperCase()}</Text>
                                  )}
                                </View>
                              ))}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.collapsedSummary}>
                          {exercises.slice(0, 3).map((ex, i) => (
                            <Text key={i} style={styles.collapsedExLine} numberOfLines={1}>
                              • {ex.sets.length} sets × {ex.name}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {/* ============================================================ */}
        {/* WORKOUT TAB                                                  */}
        {/* ============================================================ */}
        {currentTab === 'workout' && (
          activeSession ? (
            <View style={{ flex: 1 }}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.headerWorkoutTitle}>{activeSession.title}</Text>
                  <Text style={styles.headerTimer}>{formatTime(elapsedSeconds)}</Text>
                </View>
                <TouchableOpacity style={styles.finishBtn} onPress={handleFinishWorkout}>
                  <Text style={styles.finishBtnText}>Finish</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.ribbon}>
                <View style={styles.ribbonItem}>
                  <Text style={styles.ribbonValue}>{activeSession.totalTonnage.toLocaleString()} lbs</Text>
                  <Text style={styles.ribbonLabel}>Volume</Text>
                </View>
                <View style={styles.ribbonDivider} />
                <View style={styles.ribbonItem}>
                  <Text style={styles.ribbonValue}>{activeSession.totalReps}</Text>
                  <Text style={styles.ribbonLabel}>Total Reps</Text>
                </View>
                <View style={styles.ribbonDivider} />
                <View style={styles.ribbonItem}>
                  <Text style={styles.ribbonValue}>{sessionExercises.length}</Text>
                  <Text style={styles.ribbonLabel}>Exercises</Text>
                </View>
              </View>

              <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 120 }}>
                {sessionExercises.map((ex) => {
                  const sets = setsByExercise[ex.id] || [];

                  return (
                    <View key={ex.id} style={styles.card}>
                      <View style={styles.cardTop}>
                        <Text style={styles.cardTitle}>{ex.exerciseId}</Text>
                      </View>

                      <View style={styles.rowHeader}>
                        <Text style={[styles.headerCell, { width: 36, textAlign: 'center' }]}>SET</Text>
                        <Text style={[styles.headerCell, { width: 85 }]}>PREVIOUS</Text>
                        <Text style={[styles.headerCell, { flex: 1 }]}>LBS</Text>
                        <Text style={[styles.headerCell, { flex: 1 }]}>REPS</Text>
                        <Text style={[styles.headerCell, { width: 44, textAlign: 'center' }]}>✓</Text>
                      </View>

                      {sets.map((item) => (
                        <View
                          key={item.id}
                          style={[styles.row, item.isCompleted && styles.rowCompleted]}
                        >
                          <TouchableOpacity
                            style={[
                              styles.setTag,
                              item.setType === 'warmup'
                                ? styles.badgeWarmup
                                : item.setType === 'drop'
                                ? styles.badgeDrop
                                : item.setType === 'failure'
                                ? styles.badgeFailure
                                : styles.badgeNormal,
                            ]}
                            onPress={() => handleCycleSetType(ex.id, item)}
                          >
                            <Text style={styles.setTagText}>
                              {item.setType === 'warmup'
                                ? 'W'
                                : item.setType === 'drop'
                                ? 'D'
                                : item.setType === 'failure'
                                ? 'F'
                                : item.setIndex}
                            </Text>
                          </TouchableOpacity>

                          <View style={{ width: 85 }}>
                            <Text style={styles.previousGhost}>
                              {item.weight > 0 ? `${item.weight} lbs × ${item.reps}` : '—'}
                            </Text>
                          </View>

                          <TextInput
                            style={[styles.input, item.isCompleted && styles.inputCompleted]}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#555"
                            defaultValue={item.weight > 0 ? String(item.weight) : ''}
                            onChangeText={(v) => handleUpdateField(ex.id, item.id, 'weight', v)}
                          />

                          <TextInput
                            style={[styles.input, item.isCompleted && styles.inputCompleted]}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#555"
                            defaultValue={item.reps > 0 ? String(item.reps) : ''}
                            onChangeText={(v) => handleUpdateField(ex.id, item.id, 'reps', v)}
                          />

                          <TouchableOpacity
                            style={[styles.checkCircle, item.isCompleted && styles.checkCircleDone]}
                            onPress={() => handleToggleComplete(ex.id, item.id)}
                          >
                            <Text style={[styles.checkMark, item.isCompleted && styles.checkMarkDone]}>
                              ✓
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity style={styles.addSetRow} onPress={() => handleAddSet(ex.id)}>
                        <Text style={styles.addSetText}>+ Add Set</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <TouchableOpacity style={styles.addExerciseBtn} onPress={() => setPickerVisible(true)}>
                  <Text style={styles.addExerciseBtnText}>+ Add Exercise</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ) : (
            <ScrollView style={styles.screenScroll} contentContainerStyle={{ paddingBottom: 100 }}>
              <Text style={styles.mainTitle}>Start Workout</Text>

              <TouchableOpacity style={styles.startEmptyCard} onPress={handleStartEmptyWorkout}>
                <View>
                  <Text style={styles.startEmptyTitle}>Quick Start</Text>
                  <Text style={styles.startEmptySub}>Log a workout on the fly</Text>
                </View>
                <Text style={styles.quickStartLightning}>⚡</Text>
              </TouchableOpacity>

              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionHeading}>Routines & Playlists</Text>
                  <Text style={styles.sectionSub}>{routines.length} saved templates</Text>
                </View>
                <TouchableOpacity
                  style={styles.createPlaylistBtn}
                  onPress={handleOpenCreateModal}
                >
                  <Text style={styles.createPlaylistBtnText}>+ New Playlist</Text>
                </TouchableOpacity>
              </View>

              {routines.map((item) => (
                <View key={item.template.id} style={styles.playlistCard}>
                  <View style={styles.playlistCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playlistTitle}>{item.template.title}</Text>
                      <Text style={styles.playlistExCount}>{item.exercises.length} movements</Text>
                    </View>
                    <View style={styles.playlistActionsRow}>
                      <TouchableOpacity
                        style={styles.playlistActionBtn}
                        onPress={() => handleOpenEditModal(item)}
                      >
                        <Text style={styles.playlistEditBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.playlistActionBtn}
                        onPress={() => confirmDeleteRoutine(item.template.id)}
                      >
                        <Text style={styles.playlistDeleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.playlistExerciseSummary} numberOfLines={2}>
                    {item.exercises.join(' • ')}
                  </Text>

                  <TouchableOpacity
                    style={styles.startRoutineBtn}
                    onPress={() => handleStartWorkoutFromRoutine(item)}
                  >
                    <Text style={styles.startRoutineBtnText}>Start Workout</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )
        )}

        {/* ============================================================ */}
        {/* PROFILE TAB (Custom Interactive Bar Graph Statistics)       */}
        {/* ============================================================ */}
        {currentTab === 'profile' && (
          <View style={{ flex: 1 }}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>JC</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.profileName}>Athlete Profile</Text>
                <Text style={styles.profileMeta}>Intermediate Lifter</Text>
              </View>
            </View>

            <View style={styles.subTabNav}>
              {(['statistics', 'calendar', 'measurements', 'exercises'] as ProfileSubTab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.subTabPill, profileSubTab === tab && styles.subTabPillActive]}
                  onPress={() => setProfileSubTab(tab)}
                >
                  <Text
                    style={[
                      styles.subTabPillText,
                      profileSubTab === tab && styles.subTabPillTextActive,
                    ]}
                  >
                    {tab.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={styles.screenScroll} contentContainerStyle={{ paddingBottom: 100 }}>
              {/* SUBTAB 1: DYNAMIC STATISTICS BAR GRAPH */}
              {profileSubTab === 'statistics' && (
                <View>
                  {/* Total Quick Glance Ribbon */}
                  <View style={styles.statGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>{totalWorkoutsCount}</Text>
                      <Text style={styles.statBoxLabel}>Workouts</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>{totalVolumeAllTime.toLocaleString()}</Text>
                      <Text style={styles.statBoxLabel}>Total Volume (lbs)</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>{totalRepsAllTime.toLocaleString()}</Text>
                      <Text style={styles.statBoxLabel}>Total Reps</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>{routines.length}</Text>
                      <Text style={styles.statBoxLabel}>Playlists</Text>
                    </View>
                  </View>

                  {/* BAR GRAPH CARD CONTAINER */}
                  <View style={styles.chartCard}>
                    <View style={styles.chartHeaderBlock}>
                      <View>
                        <Text style={styles.chartTitle}>Progress Analytics</Text>
                        <Text style={styles.chartTotalValue}>
                          {totalAggregatedMetric.toLocaleString()}{' '}
                          <Text style={styles.chartUnitText}>{metricUnitLabel}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* Filter 1: Time Horizon Selector (Month, Year, All Time) */}
                    <View style={styles.filterControlRow}>
                      {(['month', 'year', 'all'] as TimeHorizon[]).map((h) => (
                        <TouchableOpacity
                          key={h}
                          style={[styles.filterChip, timeHorizon === h && styles.filterChipActive]}
                          onPress={() => setTimeHorizon(h)}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              timeHorizon === h && styles.filterChipTextActive,
                            ]}
                          >
                            {h === 'month' ? 'Month' : h === 'year' ? 'Year' : 'All Time'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Filter 2: Metric Type Selector (Volume, Duration, Reps) */}
                    <View style={styles.metricFilterRow}>
                      {(['volume', 'duration', 'reps'] as MetricType[]).map((m) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.metricPill, activeMetric === m && styles.metricPillActive]}
                          onPress={() => setActiveMetric(m)}
                        >
                          <Text
                            style={[
                              styles.metricPillText,
                              activeMetric === m && styles.metricPillTextActive,
                            ]}
                          >
                            {m === 'volume' ? 'Volume (lbs)' : m === 'duration' ? 'Duration (mins)' : 'Reps'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* THE INTERACTIVE BAR CHART */}
                    <View style={styles.barPlotArea}>
                      {graphData.map((item, index) => {
                        const ratio = maxChartValue > 0 ? item.value / maxChartValue : 0;
                        const barHeightPercentage = Math.max(Math.round(ratio * 100), 4);

                        return (
                          <View key={index} style={styles.barColumn}>
                            {/* Value tooltip above column */}
                            <Text style={styles.barValueLabel}>
                              {item.value > 999 ? `${(item.value / 1000).toFixed(1)}k` : item.value > 0 ? item.value : ''}
                            </Text>

                            {/* Flexible Track & Bar */}
                            <View style={styles.barTrack}>
                              <View
                                style={[
                                  styles.barFill,
                                  { height: `${barHeightPercentage}%` },
                                  item.value > 0 && styles.barFillActive,
                                ]}
                              />
                            </View>

                            {/* X-Axis Axis Label */}
                            <Text style={styles.barXLabel} numberOfLines={1}>
                              {item.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {/* SUBTAB 2: CALENDAR */}
              {profileSubTab === 'calendar' && (
                <View style={styles.calendarCard}>
                  <Text style={styles.calendarHeading}>Last 30 Days Consistency</Text>
                  <Text style={styles.calendarSub}>Green cells indicate completed training sessions</Text>

                  <View style={styles.heatGrid}>
                    {currentMonthDays.map((item, idx) => (
                      <View
                        key={idx}
                        style={[styles.heatCell, item.hasTrained && styles.heatCellActive]}
                      >
                        <Text style={[styles.heatDayText, item.hasTrained && styles.heatDayTextActive]}>
                          {item.dayNum}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* SUBTAB 3: MEASUREMENTS */}
              {profileSubTab === 'measurements' && (
                <View>
                  <View style={styles.measurementsTopBar}>
                    <Text style={styles.sectionHeading}>Metrics History</Text>
                    <TouchableOpacity
                      style={styles.addMeasurementBtn}
                      onPress={() => setAddMeasurementModal(true)}
                    >
                      <Text style={styles.addMeasurementBtnText}>+ Log Entry</Text>
                    </TouchableOpacity>
                  </View>

                  {measurements.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyEmoji}>📏</Text>
                      <Text style={styles.emptyTitle}>No measurements recorded</Text>
                    </View>
                  ) : (
                    measurements.map((m) => (
                      <View key={m.id} style={styles.measurementRow}>
                        <View>
                          <Text style={styles.measurementType}>{m.metricType.toUpperCase()}</Text>
                          <Text style={styles.measurementDate}>{formatDisplayDate(m.loggedAt)}</Text>
                        </View>
                        <Text style={styles.measurementVal}>
                          {m.value} {m.metricType === 'weight' ? 'lbs' : 'in'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* SUBTAB 4: EXERCISES */}
              {profileSubTab === 'exercises' && (
                <View>
                  <Text style={styles.sectionHeading}>Exercise Library</Text>
                  {PRESET_EXERCISES.map((ex) => (
                    <View key={ex.id} style={styles.catalogCard}>
                      <View>
                        <Text style={styles.catalogName}>{ex.name}</Text>
                        <Text style={styles.catalogDetails}>
                          {ex.muscle} • {ex.equip}
                        </Text>
                      </View>
                      <View style={styles.prBadgeContainer}>
                        <Text style={styles.prBadgeText}>1RM PR: —</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* FLOATING REST TIMER */}
      {restRemaining !== null && currentTab === 'workout' && (
        <View style={styles.timerBanner}>
          <View>
            <Text style={styles.timerBannerLabel}>REST TIMER</Text>
            <Text style={styles.timerBannerTime}>{formatTime(restRemaining)}</Text>
          </View>
          <View style={styles.timerBannerActions}>
            <TouchableOpacity
              style={styles.timerBtn}
              onPress={() => setRestRemaining((t) => (t ? t + 15 : 15))}
            >
              <Text style={styles.timerBtnText}>+15s</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.timerBtnSkip}
              onPress={() => setRestRemaining(null)}
            >
              <Text style={styles.timerBtnSkipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* BOTTOM TABS */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setCurrentTab('home')}>
          <Text style={[styles.tabIcon, currentTab === 'home' && styles.tabIconActive]}>🏠</Text>
          <Text style={[styles.tabLabel, currentTab === 'home' && styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setCurrentTab('workout')}>
          <Text style={[styles.tabIcon, currentTab === 'workout' && styles.tabIconActive]}>🏋️‍♂️</Text>
          <Text style={[styles.tabLabel, currentTab === 'workout' && styles.tabLabelActive]}>Workout</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setCurrentTab('profile')}>
          <Text style={[styles.tabIcon, currentTab === 'profile' && styles.tabIconActive]}>👤</Text>
          <Text style={[styles.tabLabel, currentTab === 'profile' && styles.tabLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* PLAYLIST CREATE/EDIT MODAL */}
      <Modal visible={routineModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRoutineId ? 'Edit Playlist' : 'New Workout Playlist'}
              </Text>
              <TouchableOpacity onPress={() => setRoutineModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.routineNameInput}
              placeholder="Playlist Name (e.g. Heavy Legs, Push Split)"
              placeholderTextColor="#777"
              value={routineNameInput}
              onChangeText={setRoutineNameInput}
            />

            <FlatList
              data={PRESET_EXERCISES}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const isSelected = selectedExercisesForRoutine.includes(item.name);
                return (
                  <TouchableOpacity
                    style={[styles.modalRow, isSelected && styles.modalRowSelected]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedExercisesForRoutine((prev) => prev.filter((n) => n !== item.name));
                      } else {
                        setSelectedExercisesForRoutine((prev) => [...prev, item.name]);
                      }
                    }}
                  >
                    <View>
                      <Text style={styles.modalRowTitle}>{item.name}</Text>
                      <Text style={styles.modalRowMuscle}>{item.muscle} • {item.equip}</Text>
                    </View>
                    <View style={[styles.selectorCircle, isSelected && styles.selectorCircleActive]}>
                      {isSelected && <Text style={styles.selectorCheck}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRoutine}>
              <Text style={styles.saveBtnText}>
                {editingRoutineId ? 'Save Changes' : 'Create Playlist'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MEASUREMENT MODAL */}
      <Modal visible={addMeasurementModal} animationType="slide" transparent={true}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Body Measurement</Text>
              <TouchableOpacity onPress={() => setAddMeasurementModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.metricPickerRow}>
              {(['weight', 'arms', 'chest', 'waist'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.metricChoice, metricChoice === t && styles.metricChoiceActive]}
                  onPress={() => setMetricChoice(t)}
                >
                  <Text style={[styles.metricChoiceText, metricChoice === t && styles.metricChoiceTextActive]}>
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.measurementInput}
              keyboardType="numeric"
              placeholder={metricChoice === 'weight' ? 'Weight (lbs)' : 'Size (inches)'}
              placeholderTextColor="#777"
              value={metricValue}
              onChangeText={setMetricValue}
            />

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={async () => {
                const val = parseFloat(metricValue);
                if (isNaN(val) || val <= 0) return;
                await database.write(async () => {
                  await database.get<BodyMeasurement>('body_measurements').create((rec) => {
                    rec.metricType = metricChoice;
                    rec.value = val;
                    rec.loggedAt = new Date();
                  });
                });
                setMetricValue('');
                setAddMeasurementModal(false);
                await loadMeasurements();
              }}
            >
              <Text style={styles.saveBtnText}>Save Entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* EXERCISE PICKER MODAL */}
      <Modal visible={pickerVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Movement</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={PRESET_EXERCISES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => handleAddExercise(item.name)}
                >
                  <View>
                    <Text style={styles.modalRowTitle}>{item.name}</Text>
                    <Text style={styles.modalRowMuscle}>{item.muscle}</Text>
                  </View>
                  <Text style={styles.modalAddIcon}>+</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  screenScroll: {
    padding: 16,
  },
  homeHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  mainTitle: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '800',
  },
  subTitle: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  activeBannerSticky: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  activeBannerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#30D158',
    marginRight: 10,
  },
  activeBannerTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  activeBannerSub: {
    color: '#007AFF',
    fontSize: 12,
  },
  activeBannerReturn: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 14,
  },
  historyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardWorkoutTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  cardWorkoutDate: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  expandChevron: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '800',
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: '#141416',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  statCell: {
    alignItems: 'center',
  },
  statCellValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statCellLabel: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  collapsedSummary: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  collapsedExLine: {
    color: '#8E8E93',
    fontSize: 13,
    marginBottom: 4,
  },
  expandedSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  expandedExerciseBlock: {
    marginBottom: 12,
  },
  expandedExTitle: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  expandedSetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  setIndexMuted: {
    color: '#636366',
    fontSize: 13,
    fontWeight: '600',
    width: 60,
  },
  setWeightReps: {
    color: '#E5E5EA',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  badgeTag: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  actionBtnSmall: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  actionBtnSmallText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  startEmptyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#007AFF',
    marginVertical: 16,
  },
  startEmptyTitle: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '700',
  },
  startEmptySub: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
  },
  quickStartLightning: {
    fontSize: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  sectionHeading: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSub: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  createPlaylistBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createPlaylistBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  playlistCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  playlistCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  playlistTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  playlistExCount: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  playlistActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playlistActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
  },
  playlistEditBtnText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '700',
  },
  playlistDeleteBtnText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '800',
  },
  playlistExerciseSummary: {
    color: '#A1A1A6',
    fontSize: 13,
    marginVertical: 10,
    lineHeight: 18,
  },
  startRoutineBtn: {
    backgroundColor: '#2C2C2E',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  startRoutineBtnText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 18,
  },
  profileName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  profileMeta: {
    color: '#8E8E93',
    fontSize: 13,
  },
  subTabNav: {
    flexDirection: 'row',
    backgroundColor: '#18181A',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  subTabPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  subTabPillActive: {
    backgroundColor: '#2C2C2E',
  },
  subTabPillText: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subTabPillTextActive: {
    color: '#007AFF',
    fontWeight: '800',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    width: '48%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  statBoxValue: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
  },
  statBoxLabel: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  // BAR CHART STYLING
  chartCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 16,
  },
  chartHeaderBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  chartTitle: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chartTotalValue: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
  },
  chartUnitText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '700',
  },
  filterControlRow: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterChipActive: {
    backgroundColor: '#2C2C2E',
  },
  filterChipText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  metricFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  metricPill: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  metricPillActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderColor: '#007AFF',
  },
  metricPillText: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
  },
  metricPillTextActive: {
    color: '#007AFF',
  },
  barPlotArea: {
    flexDirection: 'row',
    height: 180,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  barColumn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 2,
  },
  barValueLabel: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 4,
  },
  barTrack: {
    width: '75%',
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#2C2C2E',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barFillActive: {
    backgroundColor: '#007AFF',
  },
  barXLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 8,
  },
  calendarCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  calendarHeading: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  calendarSub: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  heatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heatCell: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heatCellActive: {
    backgroundColor: '#30D158',
  },
  heatDayText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  heatDayTextActive: {
    color: '#121212',
  },
  measurementsTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addMeasurementBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addMeasurementBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  measurementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  measurementType: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  measurementDate: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  measurementVal: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '800',
  },
  catalogCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  catalogName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  catalogDetails: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  prBadgeContainer: {
    backgroundColor: '#2C2C2E',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  prBadgeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerWorkoutTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTimer: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  finishBtn: {
    backgroundColor: '#30D158',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  finishBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  ribbon: {
    flexDirection: 'row',
    backgroundColor: '#18181A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    alignItems: 'center',
  },
  ribbonItem: {
    flex: 1,
    alignItems: 'center',
  },
  ribbonValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  ribbonLabel: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  ribbonDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#2C2C2E',
  },
  list: {
    padding: 12,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardTop: {
    marginBottom: 12,
  },
  cardTitle: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '700',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  headerCell: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 6,
    borderRadius: 8,
  },
  rowCompleted: {
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
  },
  setTag: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  setTagText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeNormal: {
    backgroundColor: '#2C2C2E',
  },
  badgeWarmup: {
    backgroundColor: '#FF9500',
  },
  badgeDrop: {
    backgroundColor: '#AF52DE',
  },
  badgeFailure: {
    backgroundColor: '#FF3B30',
  },
  previousGhost: {
    color: '#636366',
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    color: '#FFF',
    height: 34,
    borderRadius: 6,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
    marginHorizontal: 3,
  },
  inputCompleted: {
    backgroundColor: '#1E3A2B',
  },
  checkCircle: {
    width: 36,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  checkCircleDone: {
    backgroundColor: '#30D158',
  },
  checkMark: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '900',
  },
  checkMarkDone: {
    color: '#FFF',
  },
  addSetRow: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  addSetText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
  },
  addExerciseBtn: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 10,
  },
  addExerciseBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timerBanner: {
    position: 'absolute',
    bottom: 74,
    left: 16,
    right: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#007AFF',
    elevation: 8,
  },
  timerBannerLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerBannerTime: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
  },
  timerBannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  timerBtn: {
    backgroundColor: '#2C2C2E',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  timerBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  timerBtnSkip: {
    backgroundColor: '#FF3B30',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  timerBtnSkipText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    paddingVertical: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.4,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '800',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  modalClose: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
  },
  metricPickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 14,
  },
  metricChoice: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  metricChoiceActive: {
    backgroundColor: '#007AFF',
  },
  metricChoiceText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  metricChoiceTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  measurementInput: {
    backgroundColor: '#2C2C2E',
    color: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  routineNameInput: {
    backgroundColor: '#2C2C2E',
    color: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginVertical: 14,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalRowSelected: {
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  modalRowTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalRowMuscle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  modalAddIcon: {
    color: '#007AFF',
    fontSize: 22,
    fontWeight: '700',
  },
  selectorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorCircleActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  selectorCheck: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  saveBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});