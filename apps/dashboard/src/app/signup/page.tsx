"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Shield, AlertCircle, Zap, Lock, Globe } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    organizationName: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      await register(
        formData.email,
        formData.password,
        formData.name,
        formData.organizationName,
      );
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Branding Section */}
        <div className="hidden lg:block space-y-8">
          <div>
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-primary blur-xl opacity-50"></div>
                <div className="relative flex items-center justify-center w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-bold text-foreground">
                  SentinelDAO
                </h1>
                <p className="text-primary text-sm font-medium">
                  Autonomous DeFi Defense
                </p>
              </div>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Real-time cross-chain threat detection and automated defense for
              DeFi protocols
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold mb-1">
                  Chainlink CRE Integration
                </h3>
                <p className="text-sm text-muted-foreground">
                  Decentralized monitoring with EVM Log Triggers
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold mb-1">
                  CCIP Cross-Chain Defense
                </h3>
                <p className="text-sm text-muted-foreground">
                  Pause vaults across all chains simultaneously
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold mb-1">
                  AI Threat Analysis
                </h3>
                <p className="text-sm text-muted-foreground">
                  Google Gemini powered risk assessment
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Trusted by DeFi protocols to protect billions in TVL
            </p>
          </div>
        </div>

        {/* Signup Form Section */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="text-center lg:text-left mb-8 lg:hidden">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              SentinelDAO
            </h1>
            <p className="text-muted-foreground">Create your organization</p>
          </div>
          <div className="hidden lg:block mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Get started
            </h2>
            <p className="text-muted-foreground">
              Create your organization and start protecting your vaults
            </p>
          </div>

          <div className="bg-card backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-border">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div>
                <label
                  htmlFor="organizationName"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Organization Name
                </label>
                <input
                  id="organizationName"
                  type="text"
                  value={formData.organizationName}
                  onChange={(e) =>
                    handleChange("organizationName", e.target.value)
                  }
                  required
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Your Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  At least 8 characters
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    handleChange("confirmPassword", e.target.value)
                  }
                  required
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-primary hover:text-primary/80 font-medium"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center lg:text-left text-sm text-muted-foreground mt-8">
            Powered by{" "}
            <span className="text-primary font-medium">Chainlink</span> •
            Secured by <span className="text-primary font-medium">AI</span>
          </p>
        </div>
      </div>
    </div>
  );
}
