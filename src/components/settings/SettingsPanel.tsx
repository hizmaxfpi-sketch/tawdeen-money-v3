import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, KeyRound, RotateCcw, Users } from 'lucide-react';
import { CompanySettings } from './CompanySettings';
import { AccountSettings } from './AccountSettings';
import { ResetSettings } from './ResetSettings';
import { UserManagement } from './UserManagement';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="text-right text-lg">الإعدادات</SheetTitle>
        </SheetHeader>
        
        <Tabs defaultValue="company" dir="rtl" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
            <TabsTrigger value="company" className="text-xs gap-1 px-1">
              <Building2 className="h-3.5 w-3.5" />
              الشركة
            </TabsTrigger>
            <TabsTrigger value="account" className="text-xs gap-1 px-1">
              <KeyRound className="h-3.5 w-3.5" />
              الحساب
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs gap-1 px-1">
              <Users className="h-3.5 w-3.5" />
              المستخدمين
            </TabsTrigger>
            <TabsTrigger value="reset" className="text-xs gap-1 px-1">
              <RotateCcw className="h-3.5 w-3.5" />
              تهيئة
            </TabsTrigger>
          </TabsList>
          
          <div className="p-4">
            <TabsContent value="company" className="mt-0">
              <CompanySettings />
            </TabsContent>
            <TabsContent value="account" className="mt-0">
              <AccountSettings />
            </TabsContent>
            <TabsContent value="users" className="mt-0">
              <UserManagement />
            </TabsContent>
            <TabsContent value="reset" className="mt-0">
              <ResetSettings />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
