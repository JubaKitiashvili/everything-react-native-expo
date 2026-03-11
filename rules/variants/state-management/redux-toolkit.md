---
description: State management guidelines — Redux Toolkit with createSlice and createAsyncThunk
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# State Management

## Architecture

| State Type | Tool | When |
|-----------|------|------|
| **Global state** | Redux Toolkit | All shared app state (auth, UI, entities) |
| **Async operations** | createAsyncThunk | API calls, async flows |
| **Form state** | React Hook Form | Complex forms with validation |
| **Ephemeral state** | useState | Component-local, non-shared |
| **Derived state** | createSelector | Memoized selectors for computed state |

## Store Setup

```tsx
// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import { authSlice } from './authSlice';
import { usersSlice } from './usersSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    users: usersSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use these instead of plain useDispatch/useSelector
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

## Slice Pattern

```tsx
// store/usersSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunks
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      return await api.getUsers();
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  },
);

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async (user: User, { rejectWithValue }) => {
    try {
      return await api.updateUser(user);
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  },
);

// Slice
interface UsersState {
  data: User[];
  isLoading: boolean;
  error: string | null;
}

const initialState: UsersState = {
  data: [],
  isLoading: false,
  error: null,
};

export const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    userUpdatedLocally(state, action: PayloadAction<User>) {
      const idx = state.data.findIndex((u) => u.id === action.payload.id);
      if (idx !== -1) state.data[idx] = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.data = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isLoading = false;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const idx = state.data.findIndex((u) => u.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      });
  },
});

export const { clearError, userUpdatedLocally } = usersSlice.actions;
```

## Selectors

```tsx
// store/usersSelectors.ts
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';

const selectUsersState = (state: RootState) => state.users;

export const selectAllUsers = createSelector(
  [selectUsersState],
  (users) => users.data,
);

export const selectActiveUsers = createSelector(
  [selectAllUsers],
  (users) => users.filter((u) => u.isActive),
);

export const selectUsersLoading = (state: RootState) => state.users.isLoading;
export const selectUsersError = (state: RootState) => state.users.error;
```

## Component Usage

```tsx
// Screens/UsersScreen.tsx
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchUsers } from '@/store/usersSlice';
import { selectAllUsers, selectUsersLoading } from '@/store/usersSelectors';

export const UsersScreen = () => {
  const dispatch = useAppDispatch();
  const users = useAppSelector(selectAllUsers);
  const isLoading = useAppSelector(selectUsersLoading);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  if (isLoading) return <LoadingSpinner />;

  return <UserList users={users} />;
};
```

## Rules
- One slice per domain feature — combine at store level
- Use `createAsyncThunk` for all async operations
- Use `useAppDispatch` and `useAppSelector` (typed hooks) everywhere
- Selectors with `createSelector` for derived data — never compute in components
- Immer is built-in — mutate state directly inside reducers (it's safe)
- Normalize entity state with `createEntityAdapter` for large collections
- No prop drilling beyond 2 component levels
- Type `RootState` and `AppDispatch` at store level, export typed hooks
- Keep slices focused: one file per slice with actions, thunks, and reducer
