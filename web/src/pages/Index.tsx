import { Link } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { ArrowRight, Cpu, GitBranch, MessageSquare, Shield } from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'Autonomous Chat Agent',
    description: 'Ask anything about your codebase. Lumis understands context, architecture, and intent.'
  },
  {
    icon: Shield,
    title: 'Predictive Risk Engine',
    description: 'Detect high-risk code paths and potential regressions before they reach production.'
  },
  {
    icon: GitBranch,
    title: 'Deep Git Integration',
    description: 'Real-time webhook sync, commit analysis, and intelligent diff understanding.'
  },
  {
    icon: Cpu,
    title: 'Intelligent Tracking',
    description: 'Connect your project tracker. Lumis maps issues to code and surfaces actionable insights.'
  }];


const Index = () => {
  return (
    <div className="min-h-screen bg-background bg-mesh grain">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 pt-14">
        {/* Background grid */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />

        {/* Glow */}
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-[120px]" />

        <div className="relative z-10 max-w-3xl text-center">
          <div className="animate-fade-in-up mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            <span>Lumis - The Smart Agent with Brain</span>
          </div>

          <h1 className="animate-fade-in-up-delay-1 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            The Memory Layer{' '}
            <span className="gradient-text">for your Software</span>
          </h1>

          <p className="animate-fade-in-up-delay-2 mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Ingest your GitHub repos. Ask questions in natural language.
            Detect risks before they become bugs. Lumis understands your code so you can move faster.
          </p>

          <div className="animate-fade-in-up-delay-3 mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              to="/signup"
              className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg glow-effect hover:bg-primary/90 transition-all">

              Start Building
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors">

              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) =>
            <div
              key={f.title}
              className={`group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg animate-fade-in-up-delay-${Math.min(i + 1, 3)}`}>

              <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} NovaGate Solutions Aps. All rights reserved.</p>
      </footer>
    </div>);

};

export default Index;