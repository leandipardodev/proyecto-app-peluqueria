"use client";

import { useCallback, useReducer, useTransition } from "react";

interface FormState<T extends Record<string, unknown>> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  serverError: string | null;
  isDirty: boolean;
  submitted: boolean;
}

type Action<T> =
  | { type: "SET_FIELD"; key: keyof T; value: T[keyof T] }
  | { type: "SET_ERRORS"; errors: Partial<Record<keyof T, string>> }
  | { type: "CLEAR_ERROR"; key: keyof T }
  | { type: "SET_SERVER_ERROR"; error: string | null }
  | { type: "SET_SUBMITTED" }
  | { type: "RESET"; values: T };

function formReducer<T extends Record<string, unknown>>(
  state: FormState<T>,
  action: Action<T>
): FormState<T> {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        values: { ...state.values, [action.key]: action.value },
        isDirty: true,
        errors: { ...state.errors, [action.key]: undefined },
        serverError: null,
      };
    case "SET_ERRORS":
      return { ...state, errors: { ...state.errors, ...action.errors } };
    case "CLEAR_ERROR":
      return { ...state, errors: { ...state.errors, [action.key]: undefined } };
    case "SET_SERVER_ERROR":
      return { ...state, serverError: action.error };
    case "SET_SUBMITTED":
      return { ...state, submitted: true };
    case "RESET":
      return { values: action.values, errors: {}, serverError: null, isDirty: false, submitted: false };
    default:
      return state;
  }
}

type Validator<T> = (values: T) => Partial<Record<keyof T, string>> | null;

export function useFormState<T extends Record<string, unknown>>(
  initialValues: T,
  validate?: Validator<T>
) {
  const [state, dispatch] = useReducer(formReducer<T>, {
    values: initialValues,
    errors: {},
    serverError: null,
    isDirty: false,
    submitted: false,
  });
  const [isPending, startTransition] = useTransition();

  const setField = useCallback((key: keyof T, value: T[keyof T]) => {
    dispatch({ type: "SET_FIELD", key, value });
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const key = e.target.name as keyof T;
      const input = e.target as HTMLInputElement;
      const value = (input.type === "number" || input.type === "range"
        ? input.valueAsNumber ?? e.target.value
        : input.type === "checkbox"
          ? input.checked
          : e.target.value) as T[keyof T];
      dispatch({ type: "SET_FIELD", key, value });
    },
    []
  );

  const setErrors = useCallback((errors: Partial<Record<keyof T, string>>) => {
    dispatch({ type: "SET_ERRORS", errors });
  }, []);

  const clearError = useCallback((key: keyof T) => {
    dispatch({ type: "CLEAR_ERROR", key });
  }, []);

  const setServerError = useCallback((error: string | null) => {
    dispatch({ type: "SET_SERVER_ERROR", error });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET", values: initialValues });
  }, [initialValues]);

  const submit = useCallback(
    (action: (values: T) => Promise<{ success: true } | { success: false; error: string }>) => {
      dispatch({ type: "SET_SUBMITTED" });

      if (validate) {
        const validationErrors = validate(state.values);
        if (validationErrors) {
          dispatch({ type: "SET_ERRORS", errors: validationErrors });
          return;
        }
      }

      startTransition(async () => {
        const result = await action(state.values);
        if (!result.success) {
          dispatch({ type: "SET_SERVER_ERROR", error: result.error });
        }
      });

      return { success: true } as const;
    },
    [state.values, validate]
  );

  const getFieldProps = useCallback(
    (key: keyof T) => ({
      name: key as string,
      value: state.values[key] as string | number | readonly string[] | undefined,
      onChange: onInputChange,
      error: state.errors[key],
    }),
    [state.values, state.errors, onInputChange]
  );

  return {
    values: state.values,
    errors: state.errors,
    serverError: state.serverError,
    isDirty: state.isDirty,
    submitted: state.submitted,
    isPending,
    setField,
    onInputChange,
    setErrors,
    clearError,
    setServerError,
    reset,
    submit,
    getFieldProps,
  };
}
