import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { SplashVideo } from "./splash-video";

type SubView = "sign-in" | "forgot-password";

interface SignInScreenProps {
  isDarkMode: boolean;
  onBack: () => void;
  onSuccess: () => void;
  onCreateAccount: () => void;
}

export function SignInScreen({
  isDarkMode,
  onBack,
  onSuccess,
  onCreateAccount,
}: SignInScreenProps) {
  const [subView, setSubView] = useState<SubView>("sign-in");

  /* ── Theme tokens — forced dark ── */
  const textColor = "#E2E8F0";
  const mutedColor = "#7D92A8";
  const headerIconColor = "#CBD5E1";
  const inputBg = "rgba(15, 34, 56, 0.7)";
  const inputBorder = "#2D4A66";
  const inputText = "#E2E8F0";
  const placeholderColor = "#5A7A96";
  const errorColor = "#F87171";
  const errorBorder = "rgba(248,113,113,0.5)";

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
      {/* Fullscreen looping video background */}
      <SplashVideo />

      <AnimatePresence mode="wait">
        {subView === "sign-in" ? (
          <SignInForm
            key="sign-in"
            isDarkMode={isDarkMode}
            textColor={textColor}
            mutedColor={mutedColor}
            headerIconColor={headerIconColor}
            inputBg={inputBg}
            inputBorder={inputBorder}
            inputText={inputText}
            placeholderColor={placeholderColor}
            errorColor={errorColor}
            errorBorder={errorBorder}
            onBack={onBack}
            onSuccess={onSuccess}
            onCreateAccount={onCreateAccount}
            onForgotPassword={() => setSubView("forgot-password")}
          />
        ) : (
          <ForgotPasswordForm
            key="forgot-password"
            isDarkMode={isDarkMode}
            textColor={textColor}
            mutedColor={mutedColor}
            headerIconColor={headerIconColor}
            inputBg={inputBg}
            inputBorder={inputBorder}
            inputText={inputText}
            placeholderColor={placeholderColor}
            errorColor={errorColor}
            errorBorder={errorBorder}
            onBack={() => setSubView("sign-in")}
          />
        )}
      </AnimatePresence>

      {/* Placeholder-color styling for inputs */}
      <style>{`
        .sign-in-input::placeholder {
          color: ${placeholderColor};
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sign-In Form
   ═══════════════════════════════════════════════════════════ */

interface FormTokens {
  isDarkMode: boolean;
  textColor: string;
  mutedColor: string;
  headerIconColor: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  placeholderColor: string;
  errorColor: string;
  errorBorder: string;
}

interface SignInFormProps extends FormTokens {
  onBack: () => void;
  onSuccess: () => void;
  onCreateAccount: () => void;
  onForgotPassword: () => void;
}

function SignInForm({
  textColor,
  mutedColor,
  headerIconColor,
  inputBg,
  inputBorder,
  inputText,
  placeholderColor,
  errorColor,
  errorBorder,
  onBack,
  onSuccess,
  onCreateAccount,
  onForgotPassword,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = useCallback(() => {
    let hasFieldError = false;
    setAuthError("");

    if (!email.trim() || !validateEmail(email)) {
      setEmailError("Please enter a valid email address.");
      hasFieldError = true;
    } else {
      setEmailError("");
    }

    if (!password) {
      setPasswordError("Password is required.");
      hasFieldError = true;
    } else {
      setPasswordError("");
    }

    if (hasFieldError) return;

    setLoading(true);

    // Simulate authentication
    setTimeout(() => {
      setLoading(false);
      // Prototype: always succeed. To preview the error state,
      // swap onSuccess() for setAuthError("Incorrect email or password. Please try again.")
      onSuccess();
    }, 1400);
  }, [email, password, onSuccess]);

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex-1 flex flex-col"
      style={{ position: "relative", zIndex: 1 }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center px-4 flex-shrink-0"
        style={{
          height: "56px",
          paddingTop: "env(safe-area-inset-top, 0px)",
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
      >
        {/* Title */}
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
          Sign In
        </h1>

        {/* Fields */}
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
                if (emailError) setEmailError("");
                if (authError) setAuthError("");
              }}
              style={inputStyle(!!emailError)}
              className="sign-in-input"
            />
            {emailError && (
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
                {emailError}
              </motion.p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col" style={{ gap: "6px" }}>
            <div style={passwordWrapperStyle(!!passwordError)}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                  if (authError) setAuthError("");
                }}
                style={passwordInputStyle}
                className="sign-in-input"
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
            {passwordError && (
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
                {passwordError}
              </motion.p>
            )}

            {/* Forgot password link — right-aligned beneath the password field */}
            <div className="flex justify-end" style={{ marginTop: "2px" }}>
              <button
                onClick={onForgotPassword}
                className="cursor-pointer"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "13px",
                  fontWeight: 500,
                  color: mutedColor,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  lineHeight: 1.5,
                }}
              >
                Forgot password?
              </button>
            </div>
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
              "Sign In"
            )}
          </button>

          {/* Auth error — generic, beneath button */}
          <AnimatePresence>
            {authError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: errorColor,
                  marginTop: "12px",
                  textAlign: "center",
                  lineHeight: 1.5,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                {authError}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Create account link */}
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
            Don't have an account?{" "}
            <button
              onClick={onCreateAccount}
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
              Create one
            </button>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Forgot Password Form
   ═══════════════════════════════════════════════════════════ */

interface ForgotPasswordFormProps extends FormTokens {
  onBack: () => void;
}

function ForgotPasswordForm({
  isDarkMode,
  textColor,
  mutedColor,
  headerIconColor,
  inputBg,
  inputBorder,
  inputText,
  placeholderColor,
  errorColor,
  errorBorder,
  onBack,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const validateEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = useCallback(() => {
    if (!email.trim() || !validateEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setEmailError("");
    setLoading(true);

    // Simulate sending reset link
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1200);
  }, [email]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex-1 flex flex-col"
      style={{ position: "relative", zIndex: 1 }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center px-4 flex-shrink-0"
        style={{
          height: "56px",
          paddingTop: "env(safe-area-inset-top, 0px)",
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
      >
        {/* Title */}
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
          Forgot Password
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: "15px",
            fontWeight: 400,
            color: mutedColor,
            lineHeight: 1.6,
            marginTop: "16px",
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          Enter the email address you signed up with and we'll send you a link
          to reset your password.
        </p>

        {/* Email field + button */}
        <div
          className="flex flex-col w-full"
          style={{ marginTop: "28px", gap: "6px" }}
        >
          <AnimatePresence mode="wait">
            {sent ? (
              /* ─── Success state ─── */
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
                style={{ marginTop: "24px" }}
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 56,
                    height: 56,
                    backgroundColor: "rgba(62, 152, 66, 0.15)",
                  }}
                >
                  <Check
                    size={28}
                    strokeWidth={2.5}
                    style={{ color: "#3E9842" }}
                  />
                </motion.div>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: textColor,
                    marginTop: "16px",
                    textAlign: "center",
                    lineHeight: 1.5,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Check your email for a reset link.
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    fontWeight: 400,
                    color: mutedColor,
                    marginTop: "6px",
                    textAlign: "center",
                    lineHeight: 1.5,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Didn't get it? Check your spam folder or try again.
                </p>
              </motion.div>
            ) : (
              /* ─── Form state ─── */
              <motion.div
                key="form"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col"
                style={{ gap: "6px" }}
              >
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  style={inputStyle(!!emailError)}
                  className="sign-in-input"
                />
                {emailError && (
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
                    {emailError}
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-[40px]" />

        {/* Button group */}
        <div className="w-full flex flex-col items-center pb-12">
          {sent ? (
            <button
              onClick={onBack}
              className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
              style={{
                backgroundColor: "#EBFD00",
                color: "#0C284A",
                fontSize: "15px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                lineHeight: 1.5,
                border: "1px solid rgba(12,40,74,0.25)",
                minHeight: "48px",
              }}
            >
              Back to Sign In
            </button>
          ) : (
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
                "Send Reset Link"
              )}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}