import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CompanyStatusGuard } from "@/components/CompanyStatusGuard";
import { RoleGuard } from "@/components/RoleGuard";
import { OfflineBanner } from "@/components/OfflineBanner";
import { NetworkContext, useNetworkStatusProvider } from "@/hooks/useNetworkStatus";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SuperAdmin from "./pages/SuperAdmin";
import AddContainer from "./pages/AddContainer";
import AddShipment from "./pages/AddShipment";
import EditContainer from "./pages/EditContainer";
import EditShipment from "./pages/EditShipment";
import AddContact from "./pages/AddContact";
import EditContact from "./pages/EditContact";
import { ContactDetails } from "./pages/ContactDetails";
import { FundDetails } from "./pages/FundDetails";
import { ProjectDetails } from "./pages/ProjectDetails";
import NotFound from "./pages/NotFound";
import TrackShipment from "./pages/TrackShipment";
import { useSupabaseFinance } from "@/hooks/useSupabaseFinance";
import { useCurrencies } from "@/hooks/useCurrencies";

const queryClient = new QueryClient();

// Wrapper component for FundDetails with data
function FundDetailsWrapper() {
  const { funds, transactions, updateFund, deleteFund, deleteTransaction } = useSupabaseFinance();
  const { currencies } = useCurrencies();
  return (
    <FundDetails 
      funds={funds} 
      transactions={transactions} 
      currencies={currencies}
      onUpdateFund={updateFund}
      onDeleteFund={deleteFund}
      onDeleteTransaction={deleteTransaction}
    />
  );
}

function AppInner() {
  return (
    <>
      <OfflineBanner />
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<SuperAdmin />} />
              <Route path="/" element={<ProtectedRoute><CompanyStatusGuard><Index /></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/shipping/add-container" element={<ProtectedRoute><CompanyStatusGuard><RoleGuard><AddContainer /></RoleGuard></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/shipping/add-shipment" element={<ProtectedRoute><CompanyStatusGuard><RoleGuard><AddShipment /></RoleGuard></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/shipping/edit-container/:id" element={<ProtectedRoute><CompanyStatusGuard><RoleGuard><EditContainer /></RoleGuard></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/shipping/edit-shipment/:id" element={<ProtectedRoute><CompanyStatusGuard><RoleGuard><EditShipment /></RoleGuard></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/funds/:id" element={<ProtectedRoute><CompanyStatusGuard><FundDetailsWrapper /></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/projects/:id" element={<ProtectedRoute><CompanyStatusGuard><ProjectDetails /></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/ledger/:id" element={<ProtectedRoute><CompanyStatusGuard><ContactDetails /></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/contacts/add" element={<ProtectedRoute><CompanyStatusGuard><RoleGuard><AddContact /></RoleGuard></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/contacts/edit/:id" element={<ProtectedRoute><CompanyStatusGuard><RoleGuard><EditContact /></RoleGuard></CompanyStatusGuard></ProtectedRoute>} />
              <Route path="/track" element={<TrackShipment />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </>
  );
}

const App = () => {
  const networkStatus = useNetworkStatusProvider();
  return (
    <QueryClientProvider client={queryClient}>
      <NetworkContext.Provider value={networkStatus}>
        <LanguageProvider>
          <AppInner />
        </LanguageProvider>
      </NetworkContext.Provider>
    </QueryClientProvider>
  );
};

export default App;
