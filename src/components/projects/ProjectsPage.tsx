import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, Plus, X, TrendingUp, CheckCircle, 
  Clock, DollarSign, AlertCircle, Edit, Trash2,
  Calendar, User, Building, ChevronDown, ChevronUp,
  FileText, Paperclip, RefreshCw, Eye, TrendingDown,
  ArrowUpCircle, ArrowDownCircle, Search, Filter, SlidersHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Project, ProjectStatus, ProjectStats, AccountOption, Transaction } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { LoadMoreSpinner } from '@/components/shared/LoadMoreSpinner';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { CurrencyDisplaySelector, convertForDisplay, getCurrencySymbol } from '@/components/shared/CurrencyDisplaySelector';

const statusConfig: Record<ProjectStatus, { label: string; color: string; icon: typeof Clock }> = {
  active: { label: 'قيد التنفيذ', color: 'bg-blue-500', icon: Clock },
  completed: { label: 'منجز', color: 'bg-emerald-500', icon: CheckCircle },
  paused: { label: 'متوقف', color: 'bg-amber-500', icon: AlertCircle },
  cancelled: { label: 'ملغي', color: 'bg-red-500', icon: X },
};

interface ProjectsPageProps {
  projects: Project[];
  accountOptions: AccountOption[];
  stats: ProjectStats;
  currencies?: Currency[];
  transactions?: Transaction[];
  onAddProject?: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'profit' | 'receivedAmount'>) => void;
  onUpdateProject?: (id: string, updates: Partial<Project>) => void;
  onDeleteProject?: (id: string) => void;
  onRefresh?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export function ProjectsPage({ 
  projects, 
  accountOptions, 
  stats,
  currencies = [],
  transactions = [],
  onAddProject, 
  onUpdateProject, 
  onDeleteProject,
  onRefresh,
  hasMore,
  loadingMore,
  onLoadMore,
}: ProjectsPageProps) {
  const navigate = useNavigate();
  const canCreateProject = typeof onAddProject === 'function';
  const canEditProject = typeof onUpdateProject === 'function';
  const canDeleteProject = typeof onDeleteProject === 'function';
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [showPreview, setShowPreview] = useState(false);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);
  const fmt = (v: number) => `${sym}${conv(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    clientId: '',
    vendorId: '',
    contractValue: 0,
    expenses: 0,
    commission: 0,
    currencyDifference: 0,
    status: 'active' as ProjectStatus,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: '',
  });
  const [formAttachments, setFormAttachments] = useState<string[]>([]);

  const clients = accountOptions.filter(a => a.type === 'client');
  const vendors = accountOptions.filter(a => a.type === 'vendor');

  // Filtered projects - stats always use ALL projects (independent)
  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (filterStatus !== 'all') result = result.filter(p => p.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q) || p.vendorName?.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q));
    }
    return result;
  }, [projects, filterStatus, searchQuery]);

  // Group by status for display
  const groupedProjects = useMemo(() => {
    const groups: Record<string, Project[]> = {};
    for (const p of filteredProjects) {
      if (!groups[p.status]) groups[p.status] = [];
      groups[p.status].push(p);
    }
    return groups;
  }, [filteredProjects]);

  const statusOrder: ProjectStatus[] = ['active', 'completed', 'paused', 'cancelled'];
  const isFiltered = filterStatus !== 'all' || searchQuery.trim().length > 0;

  const resetForm = () => {
    setFormData({
      name: '',
      clientId: '',
      vendorId: '',
      contractValue: 0,
      expenses: 0,
      commission: 0,
      currencyDifference: 0,
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      notes: '',
    });
    setFormAttachments([]);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleOpenEdit = (project: Project) => {
    setFormData({
      name: project.name,
      clientId: project.clientId || '',
      vendorId: project.vendorId || '',
      contractValue: project.contractValue,
      expenses: project.expenses,
      commission: project.commission,
      currencyDifference: project.currencyDifference,
      status: project.status,
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      notes: project.notes || '',
    });
    setFormAttachments(project.attachments || []);
    setEditingProject(project);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    
    const clientName = clients.find(c => c.id === formData.clientId)?.name;
    const vendorName = vendors.find(v => v.id === formData.vendorId)?.name;
    
    if (editingProject) {
      if (!onUpdateProject) return;
      onUpdateProject(editingProject.id, { 
        ...formData,
        clientName,
        vendorName,
        attachments: formAttachments,
      });
      setEditingProject(null);
    } else {
      if (!onAddProject) return;
      onAddProject({ 
        ...formData,
        clientName,
        vendorName,
        attachments: formAttachments,
      });
      setShowAddForm(false);
    }
    resetForm();
  };

  const handleDelete = () => {
    if (deletingProject && onDeleteProject) {
      onDeleteProject(deletingProject.id);
      setDeletingProject(null);
    }
  };

  const handleStatusChange = (projectId: string, newStatus: ProjectStatus) => {
    if (!onUpdateProject) return;
    onUpdateProject(projectId, { status: newStatus });
  };

  // حساب الربح المتوقع في النموذج
  const calculatedProfit = useMemo(() => {
    return formData.contractValue - formData.expenses + formData.commission + formData.currencyDifference;
  }, [formData.contractValue, formData.expenses, formData.commission, formData.currencyDifference]);

  return (
    <div className="space-y-4">
      {/* الإحصائيات */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Briefcase className="h-4 w-4" />
            <span className="text-xs">إجمالي المشاريع</span>
          </div>
          <p className="text-xl font-bold">{stats.totalProjects}</p>
        </div>
        <div className="rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs">قيد التنفيذ</span>
          </div>
          <p className="text-xl font-bold">{stats.activeProjects}</p>
        </div>
        <div className="rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">الأرباح المتوقعة</span>
          </div>
          <p className="text-lg font-bold">{fmt(stats.expectedProfit)}</p>
        </div>
        <div className="rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 text-emerald-500 mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs">الأرباح المحققة</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{fmt(stats.realizedProfit)}</p>
        </div>
      </div>

      {/* محول العملة */}
      {currencies.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-muted-foreground">عرض بعملة:</span>
          <CurrencyDisplaySelector currencies={currencies} selectedCode={displayCurrency} onChange={setDisplayCurrency} />
        </div>
      )}

      {/* رأس القائمة */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">المشاريع</h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowFilters(!showFilters)} title="فلاتر">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowPreview(true)} title="معاينة">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {onRefresh && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRefresh} title="تحديث">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {canCreateProject && (
            <Button size="sm" onClick={handleOpenAdd} className="gap-1 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" />
              مشروع جديد
            </Button>
          )}
        </div>
      </div>

      {/* الفلاتر */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="bg-card rounded-xl p-3 border border-border space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث بالاسم أو العميل أو المورد..." className="h-8 text-xs pr-8" />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="الحالة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">الكل</SelectItem>
                    {Object.entries(statusConfig).map(([key, val]) => (
                      <SelectItem key={key} value={key} className="text-xs">{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isFiltered && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">نتائج: {filteredProjects.length} من {projects.length}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}>مسح الفلاتر</Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* قائمة المشاريع - مجمعة حسب الحالة */}
      <div className="space-y-3">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">لا توجد مشاريع بعد</p>
              {canCreateProject && <p className="text-xs mt-1">أضف مشروعك الأول للبدء</p>}
          </div>
        ) : (
          projects.map((project, index) => {
            const isExpanded = expandedId === project.id;
            const StatusIcon = statusConfig[project.status].icon;
            
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="rounded-xl bg-card border border-border overflow-hidden"
              >
                {/* الصف الرئيسي */}
                <div 
                  className="p-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : project.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-full shrink-0", statusConfig[project.status].color)}>
                        <StatusIcon className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {project.name}
                          {project.attachments && project.attachments.length > 0 && (
                            <Paperclip className="h-3 w-3 text-primary inline mr-1" />
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {project.clientName && (
                            <span className="flex items-center gap-0.5">
                              <User className="h-3 w-3" />
                              {project.clientName}
                            </span>
                          )}
                          {project.vendorName && (
                            <span className="flex items-center gap-0.5">
                              <Building className="h-3 w-3" />
                              {project.vendorName}
                            </span>
                          )}
                          {project.createdByName && (
                            <span className="flex items-center gap-0.5 text-primary">
                              ● {project.createdByName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="text-left">
                        <p className={cn("text-sm font-bold", project.profit >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {fmt(project.profit)}
                        </p>
                        <p className="text-[9px] text-muted-foreground">الربح</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </div>

                {/* التفاصيل الموسعة */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                        {/* تفاصيل مالية */}
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="bg-muted/50 p-2 rounded-lg">
                            <span className="text-muted-foreground">قيمة المشروع</span>
                            <p className="font-medium">{fmt(project.contractValue)}</p>
                          </div>
                          <div className="bg-muted/50 p-2 rounded-lg">
                            <span className="text-muted-foreground">التكلفة</span>
                            <p className="font-medium">{fmt(project.expenses)}</p>
                          </div>
                          {project.commission > 0 && (
                            <div className="bg-muted/50 p-2 rounded-lg">
                              <span className="text-muted-foreground">العمولة</span>
                              <p className="font-medium text-emerald-600">+{fmt(project.commission)}</p>
                            </div>
                          )}
                          {project.currencyDifference !== 0 && (
                            <div className="bg-muted/50 p-2 rounded-lg">
                              <span className="text-muted-foreground">فرق العملة</span>
                              <p className={cn("font-medium", project.currencyDifference >= 0 ? "text-emerald-600" : "text-red-500")}>
                                {project.currencyDifference >= 0 ? '+' : ''}{fmt(project.currencyDifference)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* الحالة والتواريخ */}
                        <div className="flex items-center justify-between text-[10px]">
                          <Badge variant="outline" className={cn("text-[10px]", statusConfig[project.status].color, "text-white border-0")}>
                            {statusConfig[project.status].label}
                          </Badge>
                          {project.startDate && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {project.startDate}
                            </span>
                          )}
                        </div>

                        {/* المرفقات */}
                        {project.attachments && project.attachments.length > 0 && (
                          <DocumentAttachment
                            attachments={project.attachments}
                            onAttachmentsChange={() => {}}
                            compact
                            readOnly
                          />
                        )}

                        {/* تغيير الحالة */}
                        {canEditProject && (
                          <div className="flex gap-1 flex-wrap">
                            {(['active', 'completed', 'paused', 'cancelled'] as ProjectStatus[]).map(status => (
                              <Button
                                key={status}
                                size="sm"
                                variant={project.status === status ? "default" : "outline"}
                                className="h-6 text-[10px] px-2"
                                onClick={(e) => { e.stopPropagation(); handleStatusChange(project.id, status); }}
                              >
                                {statusConfig[status].label}
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* أزرار التحكم */}
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1 px-3"
                            onClick={(e) => { e.stopPropagation(); setPreviewProject(project); setShowPreview(true); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            معاينة
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1 h-8 text-xs gap-1 bg-primary"
                            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            السجل المالي
                          </Button>
                          {canEditProject && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 px-3"
                              onClick={(e) => { e.stopPropagation(); handleOpenEdit(project); }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDeleteProject && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs gap-1 px-3"
                              onClick={(e) => { e.stopPropagation(); setDeletingProject(project); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {hasMore && onLoadMore && (
        <LoadMoreSpinner hasMore={hasMore} loading={loadingMore || false} onLoadMore={onLoadMore} />
      )}

      {/* نموذج الإضافة/التعديل */}
      <AnimatePresence>
        {((showAddForm && canCreateProject) || (editingProject && canEditProject)) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => { setShowAddForm(false); setEditingProject(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
                <h3 className="text-sm font-bold">{editingProject ? 'تعديل المشروع' : 'إنشاء مشروع جديد'}</h3>
                <button onClick={() => { setShowAddForm(false); setEditingProject(null); }} className="p-1 hover:bg-muted rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              <div className="p-4 space-y-3">
                {/* اسم المشروع */}
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">اسم المشروع *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: مشروع تجديد المكتب"
                    className="h-9 text-sm"
                  />
                </div>

                {/* العميل والمورد */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">العميل</label>
                    <Select value={formData.clientId || 'none'} onValueChange={(v) => setFormData({ ...formData, clientId: v === 'none' ? '' : v })}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="اختر العميل" />
                      </SelectTrigger>
                      <SelectContent className="z-[110]">
                        <SelectItem value="none" className="text-xs">بدون عميل</SelectItem>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">المورد</label>
                    <Select value={formData.vendorId || 'none'} onValueChange={(v) => setFormData({ ...formData, vendorId: v === 'none' ? '' : v })}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="اختر المورد" />
                      </SelectTrigger>
                      <SelectContent className="z-[110]">
                        <SelectItem value="none" className="text-xs">بدون مورد</SelectItem>
                        {vendors.map(v => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* القيم المالية */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">قيمة العقد</label>
                    <Input
                      type="number"
                      value={formData.contractValue || ''}
                      onChange={(e) => setFormData({ ...formData, contractValue: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">التكلفة</label>
                    <Input
                      type="number"
                      value={formData.expenses || ''}
                      onChange={(e) => setFormData({ ...formData, expenses: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">العمولة</label>
                    <Input
                      type="number"
                      value={formData.commission || ''}
                      onChange={(e) => setFormData({ ...formData, commission: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">فرق العملة</label>
                    <Input
                      type="number"
                      value={formData.currencyDifference || ''}
                      onChange={(e) => setFormData({ ...formData, currencyDifference: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* الربح المتوقع */}
                <div className={cn("p-3 rounded-lg text-center", calculatedProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30")}>
                  <p className="text-[11px] text-muted-foreground">الربح المتوقع</p>
                  <p className={cn("text-xl font-bold", calculatedProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    ${calculatedProfit.toLocaleString()}
                  </p>
                </div>

                {/* تاريخ البدء والانتهاء */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">تاريخ البدء</label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">تاريخ الانتهاء</label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* الحالة */}
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">الحالة</label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ProjectStatus })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[110]">
                      {Object.entries(statusConfig).map(([key, val]) => (
                        <SelectItem key={key} value={key} className="text-xs">{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ملاحظات */}
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">ملاحظات</label>
                  <Textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="أي ملاحظات إضافية..."
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* المرفقات */}
                <DocumentAttachment
                  attachments={formAttachments}
                  onAttachmentsChange={setFormAttachments}
                  maxFiles={5}
                />

                {/* أزرار */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setShowAddForm(false); setEditingProject(null); }} className="flex-1 h-9 text-xs">
                    إلغاء
                  </Button>
                  <Button onClick={handleSubmit} disabled={!formData.name.trim()} className="flex-1 h-9 text-xs">
                    {editingProject ? 'حفظ التعديلات' : 'إنشاء المشروع'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deletingProject} onOpenChange={(open) => !open && setDeletingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المشروع</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المشروع "{deletingProject?.name}"؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* معاينة تقرير المشاريع - عام أو تفصيلي */}
      <Dialog open={showPreview} onOpenChange={(open) => { setShowPreview(open); if (!open) setPreviewProject(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-2 sticky top-0 bg-card z-10 border-b border-border">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> {previewProject ? `معاينة: ${previewProject.name}` : 'معاينة تقرير المشاريع'}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-4" dir="rtl">
            <div className="bg-[hsl(215,70%,35%)] text-white p-4 rounded-xl text-center">
              <h2 className="text-lg font-bold">{previewProject ? previewProject.name : 'تقرير المشاريع'}</h2>
              <p className="text-[10px] opacity-80">{new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              {displayCurrency !== 'USD' && <p className="text-[9px] opacity-70 mt-1">العملة: {displayCurrency}</p>}
            </div>

            {/* ===== معاينة مشروع واحد ===== */}
            {previewProject ? (() => {
              const p = previewProject;
              const projTxs = transactions.filter(t => (t as any).projectId === p.id)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const totalIn = projTxs.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
              const totalOut = projTxs.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
              const StatusIcon = statusConfig[p.status].icon;
              return (
                <>
                  {/* بيانات المشروع */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full shrink-0", statusConfig[p.status].color)}>
                      <StatusIcon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Badge variant="outline" className={cn("text-[9px] mb-1", statusConfig[p.status].color, "text-white border-0")}>
                        {statusConfig[p.status].label}
                      </Badge>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        {p.clientName && <span className="flex items-center gap-0.5"><User className="h-3 w-3" />{p.clientName}</span>}
                        {p.vendorName && <span className="flex items-center gap-0.5"><Building className="h-3 w-3" />{p.vendorName}</span>}
                        {p.startDate && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" />{p.startDate}</span>}
                        {p.endDate && <span>→ {p.endDate}</span>}
                      </div>
                    </div>
                  </div>

                  {/* الملخص المالي */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2.5 rounded-lg bg-accent text-center"><p className="text-muted-foreground">قيمة العقد</p><p className="font-bold text-sm text-primary">{fmt(p.contractValue)}</p></div>
                    <div className="p-2.5 rounded-lg bg-expense/10 text-center"><p className="text-muted-foreground">التكاليف</p><p className="font-bold text-sm text-expense">{fmt(p.expenses)}</p></div>
                    {p.commission > 0 && <div className="p-2.5 rounded-lg bg-income/10 text-center"><p className="text-muted-foreground">العمولة</p><p className="font-bold text-sm text-income">+{fmt(p.commission)}</p></div>}
                    {p.currencyDifference !== 0 && <div className="p-2.5 rounded-lg bg-muted/30 text-center"><p className="text-muted-foreground">فرق العملة</p><p className={cn("font-bold text-sm", p.currencyDifference >= 0 ? "text-income" : "text-expense")}>{p.currencyDifference >= 0 ? '+' : ''}{fmt(p.currencyDifference)}</p></div>}
                    <div className="p-2.5 rounded-lg bg-muted/30 text-center"><p className="text-muted-foreground">المستلم</p><p className="font-bold text-sm">{fmt(p.receivedAmount)}</p></div>
                    <div className={cn("p-2.5 rounded-lg text-center", p.profit >= 0 ? "bg-income/10" : "bg-expense/10")}>
                      <p className="text-muted-foreground">الربح</p>
                      <p className={cn("font-bold text-sm", p.profit >= 0 ? "text-income" : "text-expense")}>{fmt(p.profit)}</p>
                    </div>
                  </div>

                  {p.notes && (
                    <div className="text-[10px] p-2 rounded-lg bg-muted/30 text-muted-foreground">{p.notes}</div>
                  )}

                  {/* بطاقات مدين/دائن */}
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="p-2 rounded-lg bg-income/10">
                      <ArrowUpCircle className="h-3.5 w-3.5 mx-auto mb-0.5 text-income" />
                      <p className="text-muted-foreground">إجمالي مدين</p>
                      <p className="font-bold text-income">{fmt(totalIn)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-expense/10">
                      <ArrowDownCircle className="h-3.5 w-3.5 mx-auto mb-0.5 text-expense" />
                      <p className="text-muted-foreground">إجمالي دائن</p>
                      <p className="font-bold text-expense">{fmt(totalOut)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-accent">
                      <DollarSign className="h-3.5 w-3.5 mx-auto mb-0.5 text-primary" />
                      <p className="text-muted-foreground">عدد العمليات</p>
                      <p className="font-bold text-primary">{projTxs.length}</p>
                    </div>
                  </div>

                  {/* جدول العمليات المالية */}
                  {projTxs.length > 0 ? (
                    <>
                      <h4 className="text-[11px] font-bold">العمليات المالية المرتبطة</h4>
                      <table className="w-full text-[9px] border-collapse">
                        <thead>
                          <tr className="bg-[hsl(215,70%,35%)] text-white">
                            <th className="p-1.5">التاريخ</th>
                            <th className="p-1.5">البيان</th>
                            <th className="p-1.5">مدين</th>
                            <th className="p-1.5">دائن</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projTxs.map((t, i) => (
                            <tr key={t.id} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                              <td className="p-1.5 text-center">{new Date(t.date).toLocaleDateString('ar-SA')}</td>
                              <td className="p-1.5 text-center">{t.description || t.category}</td>
                              <td className="p-1.5 text-center text-income font-medium">{t.type === 'in' ? fmt(t.amount) : '-'}</td>
                              <td className="p-1.5 text-center text-expense font-medium">{t.type === 'out' ? fmt(t.amount) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted font-bold border-t-2 border-primary">
                            <td className="p-1.5 text-center" colSpan={2}>الإجمالي</td>
                            <td className="p-1.5 text-center text-income">{fmt(totalIn)}</td>
                            <td className="p-1.5 text-center text-expense">{fmt(totalOut)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </>
                  ) : (
                    <div className="text-center py-4 text-[10px] text-muted-foreground">لا توجد عمليات مالية مرتبطة بهذا المشروع</div>
                  )}
                </>
              );
            })() : (
              /* ===== معاينة جميع المشاريع ===== */
              <>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="p-2.5 rounded-lg bg-accent"><p className="text-muted-foreground">إجمالي العقود</p><p className="font-bold text-sm text-primary">{fmt(projects.reduce((s, p) => s + p.contractValue, 0))}</p></div>
                  <div className="p-2.5 rounded-lg bg-expense/10"><p className="text-muted-foreground">المصروفات</p><p className="font-bold text-sm text-expense">{fmt(projects.reduce((s, p) => s + p.expenses, 0))}</p></div>
                  <div className="p-2.5 rounded-lg bg-income/10"><p className="text-muted-foreground">الأرباح</p><p className={cn("font-bold text-sm", projects.reduce((s, p) => s + p.profit, 0) >= 0 ? "text-income" : "text-expense")}>{fmt(projects.reduce((s, p) => s + p.profit, 0))}</p></div>
                </div>
                <table className="w-full text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-[hsl(215,70%,35%)] text-white">
                      <th className="p-1.5">المشروع</th>
                      <th className="p-1.5">الحالة</th>
                      <th className="p-1.5">العقد</th>
                      <th className="p-1.5">المصروفات</th>
                      <th className="p-1.5">الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p, i) => (
                      <tr key={p.id} className={cn(i % 2 === 0 ? 'bg-muted/30' : '', 'cursor-pointer hover:bg-muted/50')} onClick={() => { setPreviewProject(p); }}>
                        <td className="p-1.5 text-center font-medium">{p.name}</td>
                        <td className="p-1.5 text-center">
                          <span className={cn("px-1.5 py-0.5 rounded text-[8px] text-white", statusConfig[p.status].color)}>{statusConfig[p.status].label}</span>
                        </td>
                        <td className="p-1.5 text-center">{fmt(p.contractValue)}</td>
                        <td className="p-1.5 text-center text-expense">{fmt(p.expenses)}</td>
                        <td className={cn("p-1.5 text-center font-bold", p.profit >= 0 ? "text-income" : "text-expense")}>{fmt(p.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {projects.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted font-bold border-t-2 border-primary">
                        <td className="p-1.5 text-center" colSpan={2}>الإجمالي</td>
                        <td className="p-1.5 text-center">{fmt(projects.reduce((s, p) => s + p.contractValue, 0))}</td>
                        <td className="p-1.5 text-center text-expense">{fmt(projects.reduce((s, p) => s + p.expenses, 0))}</td>
                        <td className={cn("p-1.5 text-center", projects.reduce((s, p) => s + p.profit, 0) >= 0 ? "text-income" : "text-expense")}>{fmt(projects.reduce((s, p) => s + p.profit, 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            )}

            <div className="text-center text-[8px] text-muted-foreground border-t border-border pt-2">
              توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
