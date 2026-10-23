"use client";

import { useId } from "react";
import styles from "./ChoiceGroup.module.css";

export type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
};

export type ChoiceGroupProps = {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  required?: boolean;
  tone?: "light" | "dark";
};

/** A visible, native single-choice field. The caller owns the selected value. */
export default function ChoiceGroup({
  legend,
  name,
  value,
  onChange,
  options,
  required = false,
  tone = "light",
}: ChoiceGroupProps) {
  const groupId = useId();

  return (
    <fieldset className={`${styles.group} ${tone === "dark" ? styles.dark : styles.light}`}>
      <legend className={styles.legend}>
        {legend}
        {required && <span className={styles.required}>（必选）</span>}
      </legend>
      <div className={styles.options}>
        {options.map((option, index) => {
          const inputId = `${groupId}-${index}`;
          const labelId = `${inputId}-label`;
          const descriptionId = `${inputId}-description`;
          const selected = value === option.value;

          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={`${styles.option}${selected ? ` ${styles.selected}` : ""}`}
            >
              <input
                className={styles.input}
                id={inputId}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                required={required}
                aria-labelledby={labelId}
                aria-describedby={option.description ? descriptionId : undefined}
                onChange={() => onChange(option.value)}
              />
              <span className={styles.text}>
                <span id={labelId} className={styles.label}>{option.label}</span>
                {option.description && (
                  <span id={descriptionId} className={styles.description}>
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
