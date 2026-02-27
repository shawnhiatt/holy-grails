import { useState, useCallback } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { UnicornScene } from "./unicorn-scene";

type FieldError = { email?: string; password?: string; confirm?: string };

interface CreateAccountScreenProps {
  isDarkMode: boolean;
  onBack: () => void;
  onSuccess: () => void;
  onSignIn: () => void;
}

export function CreateAccountScreen({
  isDarkMode,
  onBack,
  onSuccess,
  onSignIn,
}: CreateAccountScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [loading, setLoading] = useState(false);

  const textColor = "#E2E8F0";
  const mutedColor = "#7D92A8";
  const headerIconColor = "#CBD5E1";
  const inputBg = "rgba(15, 34, 56, 0.7)";
  const inputBorder = "#2D4A66";
  const inputText = "#E2E8F0";
  const placeholderColor = "#5A7A96";
  const errorColor = "#F87171";
  const errorBorder = "rgba(248,113,113,0.5)";

  const validateEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = useCallback(() => {
    const errs: FieldError = {};
    if (!email.trim() || !validateEmail(email)) {
      errs.email = "Please enter a valid email address.";
    }
    if (!password) {
      errs.password = "Password is required.";
    } else if (password.length < 6) {
      errs.password = "Password must be at least 6 characters.";
    }
    if (!confirm) {
      errs.confirm = "Please confirm your password.";
    } else if (password !== confirm) {
      errs.confirm = "Passwords don't match.";
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setLoading(true);

    // Simulate account creation
    setTimeout(() => {
      setLoading(false);
      onSuccess();
    }, 1400);
  }, [email, password, confirm, onSuccess]);

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    height: "48px",
    padding: "0 14px",
    fontSize: "16px",
    fontWeight: 400,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    lineHeight: 1.5,
    color: inputText,
    backgroundColor: inputBg,
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: hasError ? errorBorder : inputBorder,
    outline: "none",
    transition: "border-color 150ms ease",
  });

  const passwordWrapperStyle = (hasError: boolean): React.CSSProperties => ({
    position: "relative",
    width: "100%",
    height: "48px",
    backgroundColor: inputBg,
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: hasError ? errorBorder : inputBorder,
    transition: "border-color 150ms ease",
    display: "flex",
    alignItems: "center",
  });

  const passwordInputStyle: React.CSSProperties = {
    flex: 1,
    height: "100%",
    padding: "0 44px 0 14px",
    fontSize: "16px",
    fontWeight: 400,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    lineHeight: 1.5,
    color: inputText,
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
    borderRadius: "10px",
  };

  const toggleBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    padding: "4px",
    cursor: "pointer",
    color: mutedColor,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#0C1A2E",
        background: "radial-gradient(ellipse 120% 60% at 50% 0%, #132B44 0%, #0C1A2E 100%)",
        position: "relative",
      }}
    >
      {/* Fullscreen WebGL scene background */}
      <UnicornScene className="absolute inset-0 w-full h-full" />

      {/* Header with back arrow */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center px-4 flex-shrink-0"
        style={{
          height: "56px",
          paddingTop: "env(safe-area-inset-top, 0px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "none",
            border: "none",
            padding: 0,
            color: headerIconColor,
          }}
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.5,
          delay: 0.1,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="flex-1 flex flex-col px-6 max-w-[440px] mx-auto w-full overflow-y-auto"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Screen title */}
        <h1
          style={{
            fontSize: "36px",
            fontWeight: 700,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            letterSpacing: "-0.5px",
            color: textColor,
            lineHeight: 1.15,
            marginTop: "8px",
          }}
        >
          Create Account
        </h1>

        {/* Form fields */}
        <div
          className="flex flex-col w-full"
          style={{ marginTop: "32px", gap: "16px" }}
        >
          {/* Email */}
          <div className="flex flex-col" style={{ gap: "6px" }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
              style={{
                ...inputStyle(!!errors.email),
                ["--placeholder-color" as string]: placeholderColor,
              }}
              className="create-account-input"
            />
            {errors.email && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: errorColor,
                  lineHeight: 1.4,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  paddingLeft: "2px",
                }}
              >
                {errors.email}
              </motion.p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col" style={{ gap: "6px" }}>
            <div style={passwordWrapperStyle(!!errors.password)}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                }}
                style={{
                  ...passwordInputStyle,
                  ["--placeholder-color" as string]: placeholderColor,
                }}
                className="create-account-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                style={toggleBtnStyle}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={2} />
                ) : (
                  <Eye size={18} strokeWidth={2} />
                )}
              </button>
            </div>
            {errors.password && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: errorColor,
                  lineHeight: 1.4,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  paddingLeft: "2px",
                }}
              >
                {errors.password}
              </motion.p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col" style={{ gap: "6px" }}>
            <div style={passwordWrapperStyle(!!errors.confirm)}>
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
                }}
                style={{
                  ...passwordInputStyle,
                  ["--placeholder-color" as string]: placeholderColor,
                }}
                className="create-account-input"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                style={toggleBtnStyle}
                tabIndex={-1}
              >
                {showConfirm ? (
                  <EyeOff size={18} strokeWidth={2} />
                ) : (
                  <Eye size={18} strokeWidth={2} />
                )}
              </button>
            </div>
            {errors.confirm && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: errorColor,
                  lineHeight: 1.4,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  paddingLeft: "2px",
                }}
              >
                {errors.confirm}
              </motion.p>
            )}
          </div>
        </div>

        {/* Button group */}
        <div className="w-full flex flex-col items-center px-[0px] pt-[24px] pb-[48px]">
          {/* Primary action */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
            style={{
              backgroundColor: "#EBFD00",
              color: "#0C284A",
              fontSize: "15px",
              fontWeight: 600,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.5,
              border: "1px solid rgba(12,40,74,0.25)",
              opacity: loading ? 0.85 : 1,
              minHeight: "48px",
            }}
          >
            {loading ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Loader2
                  size={20}
                  strokeWidth={2.5}
                  className="animate-spin"
                  style={{ color: "#0C284A" }}
                />
              </motion.div>
            ) : (
              "Create Account"
            )}
          </button>

          {/* Sign in link */}
          <p
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: mutedColor,
              marginTop: "16px",
              textAlign: "center",
              lineHeight: 1.5,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Already have an account?{" "}
            <button
              onClick={onSignIn}
              className="cursor-pointer"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "13px",
                fontWeight: 600,
                color: textColor,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Sign in
            </button>
          </p>
        </div>
      </motion.div>

      {/* Placeholder-color styling for inputs */}
      <style>{`
        .create-account-input::placeholder {
          color: ${placeholderColor};
        }
      `}</style>
    </div>
  );
}