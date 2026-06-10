import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";

// Import landing components
import Header from "../components/landing/Header";
import Hero from "../components/landing/Hero";
import ModulesSection from "../components/landing/ModulesSection";
import OfflineCallout from "../components/landing/OfflineCallout";
import PricingSection from "../components/landing/PricingSection";
import Footer from "../components/landing/Footer";

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevColor = document.body.style.color;
    document.body.style.backgroundColor = '#0A1628';
    document.body.style.color = '#f1f5f9';
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.color = prevColor;
    };
  }, []);

  return (
    <div 
      className="min-h-screen text-slate-100 font-sans selection:bg-blue-600 selection:text-white relative overflow-x-hidden"
      style={{ backgroundColor: '#0A1628' }}
    >
      {/* Grid background */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.03
        }} 
      />
      
      {/* Glow highlight */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] rounded-full pointer-events-none" 
        style={{
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          filter: 'blur(120px)'
        }}
      />

      <Header onLoginClick={() => navigate('/login')} />
      
      <Hero 
        onCTA={() => navigate('/login')} 
        onExplore={() => {
          const el = document.getElementById('modulos');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <ModulesSection />

      <OfflineCallout />

      <PricingSection 
        currentUser={auth.currentUser}
        onAuthRequired={(modules) => {
          navigate(`/register?modules=${modules.join(',')}`);
        }}
      />

      <Footer />
    </div>
  );
}
