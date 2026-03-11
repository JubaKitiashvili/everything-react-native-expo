---
description: State management guidelines — Redux with Redux Saga for side effects
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# State Management

## Architecture

| State Type | Tool | When |
|-----------|------|------|
| **Global state** | Redux | All shared app state (auth, UI, entities) |
| **Side effects** | Redux Saga | API calls, async flows, complex orchestration |
| **Form state** | React Hook Form | Complex forms with validation |
| **Ephemeral state** | useState | Component-local, non-shared |
| **Derived state** | Reselect | Memoized selectors for computed state |

## Redux Store Setup

```tsx
// store/index.ts
import { createStore, applyMiddleware, combineReducers } from 'redux';
import createSagaMiddleware from 'redux-saga';
import { authReducer } from './auth/reducer';
import { usersReducer } from './users/reducer';
import { rootSaga } from './rootSaga';

const rootReducer = combineReducers({
  auth: authReducer,
  users: usersReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const sagaMiddleware = createSagaMiddleware();

export const store = createStore(
  rootReducer,
  applyMiddleware(sagaMiddleware),
);

sagaMiddleware.run(rootSaga);
```

## Action Creators & Types

```tsx
// store/users/types.ts
export const FETCH_USERS_REQUEST = 'FETCH_USERS_REQUEST' as const;
export const FETCH_USERS_SUCCESS = 'FETCH_USERS_SUCCESS' as const;
export const FETCH_USERS_FAILURE = 'FETCH_USERS_FAILURE' as const;

// store/users/actions.ts
export const fetchUsersRequest = () => ({
  type: FETCH_USERS_REQUEST,
});

export const fetchUsersSuccess = (users: User[]) => ({
  type: FETCH_USERS_SUCCESS,
  payload: users,
});

export const fetchUsersFailure = (error: string) => ({
  type: FETCH_USERS_FAILURE,
  payload: error,
});

type UsersAction =
  | ReturnType<typeof fetchUsersRequest>
  | ReturnType<typeof fetchUsersSuccess>
  | ReturnType<typeof fetchUsersFailure>;
```

## Reducer Pattern

```tsx
// store/users/reducer.ts
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

export const usersReducer = (
  state = initialState,
  action: UsersAction,
): UsersState => {
  switch (action.type) {
    case FETCH_USERS_REQUEST:
      return { ...state, isLoading: true, error: null };
    case FETCH_USERS_SUCCESS:
      return { ...state, data: action.payload, isLoading: false };
    case FETCH_USERS_FAILURE:
      return { ...state, error: action.payload, isLoading: false };
    default:
      return state;
  }
};
```

## Redux Saga Patterns

```tsx
// store/users/sagas.ts
import { call, put, takeLatest } from 'redux-saga/effects';

function* fetchUsersSaga(): Generator {
  try {
    const users = yield call(api.getUsers);
    yield put(fetchUsersSuccess(users as User[]));
  } catch (err) {
    yield put(fetchUsersFailure((err as Error).message));
  }
}

function* updateUserSaga(action: ReturnType<typeof updateUserRequest>): Generator {
  try {
    yield call(api.updateUser, action.payload);
    yield put(updateUserSuccess(action.payload));
    // Refetch related data
    yield put(fetchUsersRequest());
  } catch (err) {
    yield put(updateUserFailure((err as Error).message));
  }
}

// Root saga
export function* usersSaga() {
  yield takeLatest(FETCH_USERS_REQUEST, fetchUsersSaga);
  yield takeLatest(UPDATE_USER_REQUEST, updateUserSaga);
}

// store/rootSaga.ts
export function* rootSaga() {
  yield all([
    fork(usersSaga),
    fork(authSaga),
  ]);
}
```

## Connected Components

```tsx
// Using connect() HOC
import { connect, ConnectedProps } from 'react-redux';

const mapStateToProps = (state: RootState) => ({
  users: state.users.data,
  isLoading: state.users.isLoading,
  error: state.users.error,
});

const mapDispatchToProps = {
  fetchUsers: fetchUsersRequest,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

const UsersScreenComponent = ({ users, isLoading, fetchUsers }: PropsFromRedux) => {
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return <UserList users={users} />;
};

export const UsersScreen = connector(UsersScreenComponent);
```

## Selectors with Reselect

```tsx
import { createSelector } from 'reselect';

const selectUsers = (state: RootState) => state.users.data;

export const selectActiveUsers = createSelector(
  [selectUsers],
  (users) => users.filter((u) => u.isActive),
);
```

## Rules
- One reducer per domain, combine at root level
- Action types as string literal constants (typed with `as const`)
- Use `takeLatest` for fetch requests, `takeEvery` for independent actions
- Selectors with Reselect for derived data — never compute in components
- No direct store imports in components — use `connect()` or typed hooks
- Type `RootState` and `AppDispatch` at store level
- Keep sagas testable — use `call` effect for all async operations
- No prop drilling beyond 2 component levels
