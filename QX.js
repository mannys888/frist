 
        // 初始化变量
        let dailySalaries = {}; // 每日工资设置 {日期: 工资}
        let attendanceRecords = {}; // 出勤记录 {日期: {员工: true/false}}
        let employees = []; // 员工列表
        let currentMonth = new Date().getMonth(); // 当前月份（0-11）
        let currentYear = 2026; // 修改为2026年起
        
        // 个人工资设置 {员工姓名: {日期: 工资}}
        let personalSalaries = {};
        
        // 导出记录 {日期: 导出时间}
        let exportRecords = {};
        
        // 当前导出类型
        let currentExportType = 'salary';
        
        // 每日工作小时数（默认8小时）
        let dailyWorkHours = 8;
        
        // 默认支付方式
        let defaultPaymentMethod = '';
        /*
        // 默认员工列表（10个员工，包含身份证号）
        const defaultEmployees = [
            {name: "张开心", idCard: "110101199001011234"},
            {name: "李四", idCard: "110101199002021235"},
            {name: "王五", idCard: "110101199003031236"},
            {name: "赵六", idCard: "110101199004041237"},
            {name: "刘七", idCard: "110101199005051238"},
            {name: "陈八", idCard: "110101199006061239"},
            {name: "杨九", idCard: "110101199007071240"},
            {name: "吴十", idCard: "110101199008081241"},
            {name: "钱十一", idCard: ""},
            {name: "孙十二", idCard: ""}
        ];
        */
        // 法定节假日（示例，2026年法定节假日）
        const holidays = [
            "2026-01-01", // 元旦
            "2026-01-28", "2026-01-29", "2026-01-30", // 春节
            "2026-04-04", // 清明节
            "2026-05-01", // 劳动节
            "2026-06-18", // 端午节
            "2026-09-24", "2026-09-25", "2026-09-26", // 中秋节
            "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07" // 国庆节
        ];
        
        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', function() {
            // 设置当前日期
            const currentDateElement = document.getElementById('currentDate');
            const today = new Date();
            // 设置为2026年
            today.setFullYear(2026);
            const formattedDate = today.toLocaleDateString('zh-CN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                weekday: 'long'
            });
            currentDateElement.textContent = formattedDate;
            
            // 初始化员工列表
            initEmployees();
            
            // 初始化个人工资数据
            initPersonalSalaries();
            
            // 初始化导出记录
            initExportRecords();
            
            // 初始化月份和年份选择器（从2026年开始）
            initMonthYearSelectors();
            
            // 初始化导出日期范围
            initExportDateRange();
            
            // 加载工作小时数设置
            loadWorkHours();
            
            // 加载支付方式设置
            loadPaymentMethod();
            
            // 从本地存储加载数据
            loadData();
            
            // 设置事件监听器
            setupEventListeners();
            
            // 初始化员工选择器
            initEmployeeSelectors();
            
            // 更新每日工资设置界面
            updateDailySalaryGrid();
            
            // 更新出勤日历
            updateAttendanceCalendar();
            
            // 设置标签页切换
            setupTabs();
            
            // 更新系统信息
            updateSystemInfo();
            
            // 初始化个人工资设置页面
            initPersonalSalaryPage();
            
            // 更新未导出数据预览
            updateUnexportedDataPreview();
        });
        
        // 初始化员工列表
        function initEmployees() {
            // 从本地存储加载员工列表，如果没有则使用默认员工
            const savedEmployees = localStorage.getItem('employeeList');
            if (savedEmployees) {
                employees = JSON.parse(savedEmployees);
            } else {
                employees = defaultEmployees.map(employee => ({
                    name: employee.name,
                    idCard: employee.idCard,
                    active: true,
                    color: getRandomColor()
                }));
                saveEmployees();
            }
        }
        
        // 初始化个人工资数据
        function initPersonalSalaries() {
            // 从本地存储加载个人工资数据
            const savedPersonalSalaries = localStorage.getItem('personalSalaries');
            if (savedPersonalSalaries) {
                personalSalaries = JSON.parse(savedPersonalSalaries);
            } else {
                // 初始化空对象
                personalSalaries = {};
                employees.forEach(employee => {
                    personalSalaries[employee.name] = {};
                });
                savePersonalSalaries();
            }
        }
        
        // 初始化导出记录
        function initExportRecords() {
            const savedExportRecords = localStorage.getItem('exportRecords');
            if (savedExportRecords) {
                exportRecords = JSON.parse(savedExportRecords);
            } else {
                exportRecords = {};
                saveExportRecords();
            }
        }
        
        // 初始化导出日期范围
        function initExportDateRange() {
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            
            // 设置默认导出日期范围为当前月
            document.getElementById('exportStartDate').valueAsDate = firstDayOfMonth;
            document.getElementById('exportEndDate').valueAsDate = lastDayOfMonth;
            
            // 初始化导出员工选择器
            initExportEmployeeSelector();
        }
        
        // 初始化导出员工选择器
        function initExportEmployeeSelector() {
            const exportEmployeeSelector = document.getElementById('exportEmployeeSelector');
            exportEmployeeSelector.innerHTML = '';
            
            employees.forEach((employee, index) => {
                if (!employee.active) return;
                
                const checkbox = document.createElement('div');
                checkbox.className = 'employee-checkbox';
                checkbox.innerHTML = `
                    <input type="checkbox" id="exportEmployee${index}" checked>
                    <label for="exportEmployee${index}">${employee.name}</label>
                `;
                exportEmployeeSelector.appendChild(checkbox);
            });
        }
        
        // 获取选中的导出员工
        function getSelectedExportEmployees() {
            const selectedEmployees = [];
            document.querySelectorAll('#exportEmployeeSelector input[type="checkbox"]').forEach((checkbox, index) => {
                if (checkbox.checked) {
                    selectedEmployees.push(employees[index].name);
                }
            });
            return selectedEmployees;
        }
        
        // 加载每日工作小时数设置
        function loadWorkHours() {
            const savedWorkHours = localStorage.getItem('dailyWorkHours');
            if (savedWorkHours) {
                dailyWorkHours = parseFloat(savedWorkHours);
                document.getElementById('dailyWorkHours').value = dailyWorkHours;
            }
        }
        
        // 保存每日工作小时数设置
        function saveWorkHours() {
            const workHours = parseFloat(document.getElementById('dailyWorkHours').value);
            if (workHours > 0 && workHours <= 24) {
                dailyWorkHours = workHours;
                localStorage.setItem('dailyWorkHours', dailyWorkHours.toString());
                showNotification('success', '设置已保存', `每日工作小时数已设置为${dailyWorkHours}小时`);
            } else {
                showNotification('error', '设置失败', '请输入有效的每日工作小时数（1-24小时）');
            }
        }
        
        // 加载支付方式设置
        function loadPaymentMethod() {
            const savedPaymentMethod = localStorage.getItem('defaultPaymentMethod');
            if (savedPaymentMethod) {
                defaultPaymentMethod = savedPaymentMethod;
                document.getElementById('defaultPaymentMethod').value = defaultPaymentMethod;
                document.getElementById('currentPaymentMethod').textContent = defaultPaymentMethod || '未设置';
            }
        }
        
        // 保存支付方式设置
        function savePaymentMethod() {
            const paymentMethod = document.getElementById('defaultPaymentMethod').value.trim();
            defaultPaymentMethod = paymentMethod;
            localStorage.setItem('defaultPaymentMethod', defaultPaymentMethod);
            document.getElementById('currentPaymentMethod').textContent = defaultPaymentMethod || '未设置';
            showNotification('success', '设置已保存', `默认支付方式已设置为${defaultPaymentMethod || '未设置'}`);
        }
        
        // 保存员工列表到本地存储
        function saveEmployees() {
            localStorage.setItem('employeeList', JSON.stringify(employees));
        }
        
        // 保存个人工资数据到本地存储
        function savePersonalSalaries() {
            localStorage.setItem('personalSalaries', JSON.stringify(personalSalaries));
        }
        
        // 保存导出记录到本地存储
        function saveExportRecords() {
            localStorage.setItem('exportRecords', JSON.stringify(exportRecords));
        }
        
        // 初始化月份和年份选择器（从2026年开始）
        function initMonthYearSelectors() {
            // 获取所有月份选择器
            const monthSelectors = [
                document.getElementById('monthSelect'),
                document.getElementById('calendarMonthSelect'),
                document.getElementById('personalSalaryMonthSelect')
            ];
            
            // 获取所有年份选择器
            const yearSelectors = [
                document.getElementById('yearSelect'),
                document.getElementById('calendarYearSelect'),
                document.getElementById('personalSalaryYearSelect')
            ];
            
            // 清空现有选项
            monthSelectors.forEach(selector => {
                if (selector) selector.innerHTML = '';
            });
            
            yearSelectors.forEach(selector => {
                if (selector) selector.innerHTML = '';
            });
            
            // 添加月份选项
            const months = [
                '1月', '2月', '3月', '4月', '5月', '6月',
                '7月', '8月', '9月', '10月', '11月', '12月'
            ];
            
            months.forEach((month, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = month;
                if (index === currentMonth) option.selected = true;
                
                // 添加到所有月份选择器
                monthSelectors.forEach(selector => {
                    if (selector) {
                        const clonedOption = option.cloneNode(true);
                        selector.appendChild(clonedOption);
                    }
                });
            });
            
            // 添加年份选项（从2026年开始，到2030年）
            for (let year = 2026; year <= 2030; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                if (year === currentYear) option.selected = true;
                
                // 添加到所有年份选择器
                yearSelectors.forEach(selector => {
                    if (selector) {
                        const clonedOption = option.cloneNode(true);
                        selector.appendChild(clonedOption);
                    }
                });
            }
        }
        
        // 初始化员工选择器
        function initEmployeeSelectors() {
            // 出勤记录页面的员工选择器
            const attendanceEmployeeSelector = document.getElementById('attendanceEmployeeSelector');
            attendanceEmployeeSelector.innerHTML = '';
            
            // 个人工资设置页面的员工选择器
            const personalSalaryEmployeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            personalSalaryEmployeeSelect.innerHTML = '<option value="">请选择员工</option>';
            
            employees.forEach((employee, index) => {
                if (!employee.active) return;
                
                // 出勤记录页面的员工复选框
                const checkbox = document.createElement('div');
                checkbox.className = 'employee-checkbox';
                checkbox.innerHTML = `
                    <input type="checkbox" id="attendanceEmployee${index}" checked>
                    <label for="attendanceEmployee${index}">${employee.name}</label>
                `;
                attendanceEmployeeSelector.appendChild(checkbox);
                
                // 个人工资设置页面的员工下拉选项
                const option = document.createElement('option');
                option.value = employee.name;
                option.textContent = employee.name;
                personalSalaryEmployeeSelect.appendChild(option);
            });
            
            // 设置出勤日期为今天（2026年）
            const today = new Date();
            today.setFullYear(2026);
            document.getElementById('attendanceDate').valueAsDate = today;
        }
        
        // 初始化个人工资设置页面
        function initPersonalSalaryPage() {
            // 设置默认选中的员工
            const personalSalaryEmployeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            if (personalSalaryEmployeeSelect.options.length > 0) {
                personalSalaryEmployeeSelect.selectedIndex = 0;
            }
            
            // 更新个人工资设置网格
            updatePersonalSalaryGrid();
        }
        
        // 设置标签页切换
        function setupTabs() {
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabId = this.id.replace('tab', '');
                    
                    // 移除所有active类
                    tabs.forEach(t => t.classList.remove('active'));
                    tabContents.forEach(tc => tc.classList.remove('active'));
                    
                    // 添加active类到当前标签
                    this.classList.add('active');
                    document.getElementById(`tab${tabId}Content`).classList.add('active');
                    
                    // 根据标签页更新内容
                    if (tabId === 'DailySalary') {
                        updateDailySalaryGrid();
                        updateDailySalaryPreview();
                        updateMonthSalaryStats();
                    } else if (tabId === 'Attendance') {
                        updateAttendanceEmployeeSummary();
                        updateAttendanceStats();
                        updateAttendanceCalendar();
                    } else if (tabId === 'Summary') {
                        updateSalarySummaryTables();
                        updatePersonalSalaryDetails();
                    } else if (tabId === 'Calendar') {
                        updateCalendarView();
                        updateCalendarStats();
                    } else if (tabId === 'PersonalSalary') {
                        updatePersonalSalaryGrid();
                        updatePersonalSalaryPreview();
                    } else if (tabId === 'Manage') {
                        updateEmployeeManagementList();
                        updateSystemInfo();
                        updateUnexportedDataPreview();
                        // 重新初始化导出员工选择器
                        initExportEmployeeSelector();
                    }
                });
            });
        }
        
        // 设置事件监听器
        function setupEventListeners() {
            // 月份应用按钮
            document.getElementById('applyMonth').addEventListener('click', function() {
                const monthSelect = document.getElementById('monthSelect');
                const yearSelect = document.getElementById('yearSelect');
                currentMonth = parseInt(monthSelect.value);
                currentYear = parseInt(yearSelect.value);
                updateDailySalaryGrid();
                updateDailySalaryPreview();
                updateMonthSalaryStats();
                showNotification('success', '月份已切换', `已切换到${currentYear}年${currentMonth + 1}月`);
            });
            
            // 本月按钮
            document.getElementById('currentMonth').addEventListener('click', function() {
                const today = new Date();
                today.setFullYear(2026); // 设置为2026年
                currentMonth = today.getMonth();
                currentYear = today.getFullYear();
                
                document.getElementById('monthSelect').value = currentMonth;
                document.getElementById('yearSelect').value = currentYear;
                
                updateDailySalaryGrid();
                updateDailySalaryPreview();
                updateMonthSalaryStats();
                showNotification('success', '返回本月', `已切换到${currentYear}年${currentMonth + 1}月`);
            });
            
            // 应用批量设置按钮
            document.getElementById('applyBatchSettings').addEventListener('click', applyBatchSalarySettings);
            
            // 预设工资按钮
            document.querySelectorAll('.preset-salary-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const salary = parseInt(this.getAttribute('data-salary'));
                    document.getElementById('weekdaySalary').value = salary;
                    document.getElementById('weekendSalary').value = Math.round(salary * 1.5);
                    document.getElementById('holidaySalary').value = Math.round(salary * 2);
                    
                    showNotification('info', '预设已加载', `工作日: ${salary}元, 周末: ${Math.round(salary * 1.5)}元, 节假日: ${Math.round(salary * 2)}元`);
                });
            });
            
            // 保存出勤记录按钮
            document.getElementById('saveAttendance').addEventListener('click', saveAttendance);
            
            // 清除今日记录按钮
            document.getElementById('clearAttendance').addEventListener('click', clearTodayAttendance);
            
            // 保存数据按钮
            document.getElementById('saveDataBtn').addEventListener('click', saveAllData);
            
            // 加载数据按钮
            document.getElementById('loadDataBtn').addEventListener('click', loadData);
            
            // 导出数据按钮
            document.getElementById('exportDataBtn').addEventListener('click', exportData);
            
            // 预览导出数据按钮
            document.getElementById('previewExportDataBtn').addEventListener('click', previewExportData);
            
            // 确认导出按钮
            document.getElementById('confirmExport').addEventListener('click', confirmExport);
            
            // 取消导出按钮
            document.getElementById('cancelExport').addEventListener('click', cancelExport);
            
            // 按日期范围导出按钮
            document.getElementById('exportRangeDataBtn').addEventListener('click', exportRangeData);
            
            // 保存工作小时数按钮
            document.getElementById('saveWorkHours').addEventListener('click', saveWorkHours);
            
            // 保存支付方式按钮
            document.getElementById('savePaymentMethod').addEventListener('click', savePaymentMethod);
            
            // 导出类型选项按钮
            document.querySelectorAll('.export-option-btn').forEach(button => {
                button.addEventListener('click', function() {
                    // 移除所有active类
                    document.querySelectorAll('.export-option-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    
                    // 添加active类到当前按钮
                    this.classList.add('active');
                    
                    // 更新当前导出类型
                    currentExportType = this.getAttribute('data-export-type');
                    
                    // 更新未导出数据预览
                    updateUnexportedDataPreview();
                });
            });
            
            // 导入数据按钮
            document.getElementById('importDataBtn').addEventListener('click', function() {
                document.getElementById('importFileInput').click();
            });
            
            // 文件导入事件
            document.getElementById('importFileInput').addEventListener('change', importData);
            
            // 重置本月数据按钮
            document.getElementById('resetCurrentMonth').addEventListener('click', resetCurrentMonthData);
            
            // 重置所有数据按钮
            document.getElementById('resetAllData').addEventListener('click', resetAllData);
            
            // 保存设置按钮
            document.getElementById('saveSettings').addEventListener('click', saveSystemSettings);
            
            // 日历月份应用按钮
            document.getElementById('applyCalendarMonth').addEventListener('click', function() {
                const monthSelect = document.getElementById('calendarMonthSelect');
                const yearSelect = document.getElementById('calendarYearSelect');
                currentMonth = parseInt(monthSelect.value);
                currentYear = parseInt(yearSelect.value);
                updateCalendarView();
                updateCalendarStats();
            });
            
            // 批量出勤设置
            document.getElementById('batchAttendance').addEventListener('change', function() {
                const value = this.value;
                if (value === 'present' || value === 'absent') {
                    const checkboxes = document.querySelectorAll('#attendanceEmployeeSelector input[type="checkbox"]');
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = (value === 'present');
                    });
                }
            });
            
            // 个人工资设置相关事件
            setupPersonalSalaryEventListeners();
            
            // 模态框关闭按钮
            document.getElementById('closePersonalSalaryModal').addEventListener('click', function() {
                document.getElementById('personalSalaryModal').classList.remove('active');
            });
            
            document.getElementById('closeBulkPersonalSalaryModal').addEventListener('click', function() {
                document.getElementById('bulkPersonalSalaryModal').classList.remove('active');
            });
            
            document.getElementById('cancelPersonalSalaries').addEventListener('click', function() {
                document.getElementById('personalSalaryModal').classList.remove('active');
            });
            
            document.getElementById('cancelBulkPersonalSalaries').addEventListener('click', function() {
                document.getElementById('bulkPersonalSalaryModal').classList.remove('active');
            });
            
            // 批量管理个人工资按钮
            document.getElementById('managePersonalSalaries').addEventListener('click', showBulkPersonalSalaryModal);
            
            // 点击模态框外部关闭模态框
            document.querySelectorAll('.modal').forEach(modal => {
                modal.addEventListener('click', function(e) {
                    if (e.target === this) {
                        this.classList.remove('active');
                    }
                });
            });
        }
        
        // 设置个人工资相关事件监听器
        function setupPersonalSalaryEventListeners() {
            // 个人工资月份应用按钮
            document.getElementById('applyPersonalSalaryMonth').addEventListener('click', function() {
                updatePersonalSalaryGrid();
                updatePersonalSalaryPreview();
            });
            
            // 个人工资员工选择变化
            document.getElementById('personalSalaryEmployeeSelect').addEventListener('change', function() {
                updatePersonalSalaryGrid();
                updatePersonalSalaryPreview();
            });
            
            // 应用统一个人工资设置
            document.getElementById('applyPersonalUniform').addEventListener('click', function() {
                applyUniformPersonalSalary();
            });
            
            // 清除个人工资设置
            document.getElementById('clearPersonalSalaries').addEventListener('click', function() {
                clearPersonalSalaries();
            });
            
            // 复制全局设置到个人
            document.getElementById('copyFromGlobal').addEventListener('click', function() {
                copyGlobalToPersonal();
            });
            
            // 保存个人工资设置
            document.getElementById('savePersonalSalaries').addEventListener('click', function() {
                savePersonalSalarySettings();
            });
            
            // 应用批量个人工资设置
            document.getElementById('applyBulkPersonalSalaries').addEventListener('click', function() {
                applyBulkPersonalSalarySettings();
            });
        }
        
        // 获取指定月份的天数
        function getDaysInMonth(year, month) {
            return new Date(year, month + 1, 0).getDate();
        }
        
        // 获取指定日期的星期几（0=周日, 1=周一, ..., 6=周六）
        function getDayOfWeek(year, month, day) {
            return new Date(year, month, day).getDay();
        }
        
        // 检查是否为周末
        function isWeekend(year, month, day) {
            const dayOfWeek = getDayOfWeek(year, month, day);
            return dayOfWeek === 0 || dayOfWeek === 6; // 周日或周六
        }
        
        // 检查是否为节假日
        function isHoliday(dateString) {
            return holidays.includes(dateString);
        }
        
        // 格式化日期字符串
        function formatDate(year, month, day) {
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        
        // 获取员工某日的工资（优先使用个人设置）
        function getEmployeeSalary(employeeName, dateString) {
            // 检查是否有个人工资设置
            if (personalSalaries[employeeName] && personalSalaries[employeeName][dateString] !== undefined) {
                return personalSalaries[employeeName][dateString];
            }
            
            // 使用全局工资设置
            return dailySalaries[dateString] || 0;
        }
        
        // 检查员工某日是否有个人工资设置
        function hasPersonalSalary(employeeName, dateString) {
            return personalSalaries[employeeName] && personalSalaries[employeeName][dateString] !== undefined;
        }
        
        // 检查数据是否已导出
        function isDataExported(dateString, dataType) {
            const exportKey = `${dateString}_${dataType}`;
            return exportRecords[exportKey] !== undefined;
        }
        
        // 标记数据为已导出
        function markDataAsExported(dateString, dataType) {
            const exportKey = `${dateString}_${dataType}`;
            exportRecords[exportKey] = new Date().toISOString();
            saveExportRecords();
        }
        
        // 获取未导出数据的数量
        function getUnexportedDataCount() {
            let count = 0;
            const today = new Date().toISOString().split('T')[0];
            
            // 统计工资数据
            for (const date in dailySalaries) {
                if (dailySalaries[date] > 0 && !isDataExported(date, 'salary')) {
                    count++;
                }
            }
            
            // 统计出勤数据
            for (const date in attendanceRecords) {
                if (Object.keys(attendanceRecords[date]).length > 0 && !isDataExported(date, 'attendance')) {
                    count++;
                }
            }
            
            // 统计个人工资数据
            for (const employee in personalSalaries) {
                for (const date in personalSalaries[employee]) {
                    if (personalSalaries[employee][date] > 0 && !isDataExported(date, 'personal')) {
                        count++;
                    }
                }
            }
            
            return count;
        }
        
        // 更新每日工资设置网格
        function updateDailySalaryGrid() {
            const dailySalaryGrid = document.getElementById('dailySalaryGrid');
            const currentMonthTitle = document.getElementById('currentMonthTitle');
            
            // 更新月份标题
            currentMonthTitle.textContent = `${currentYear}年${currentMonth + 1}月 每日工资设置`;
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
            
            let html = '';
            
            // 生成每天单元格
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const dayOfWeek = getDayOfWeek(currentYear, currentMonth, day);
                const isWeekendDay = isWeekend(currentYear, currentMonth, day);
                const isHolidayDay = isHoliday(dateString);
                const isToday = isCurrentMonth && day === today.getDate();
                
                // 获取当前设置的工资
                const currentSalary = dailySalaries[dateString] || 0;
                
                // 星期几名称
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                const dayName = dayNames[dayOfWeek];
                
                // 确定CSS类
                let cellClass = 'day-cell';
                if (isWeekendDay) cellClass += ' weekend';
                if (isToday) cellClass += ' today';
                
                html += `
                <div class="${cellClass}" data-date="${dateString}">
                    <div class="day-name">${dayName}</div>
                    <div class="day-number">${day}</div>
                    <input type="number" 
                           class="day-salary-input" 
                           value="${currentSalary}" 
                           min="0" 
                           step="1"
                           placeholder="工资"
                           data-date="${dateString}"
                           onchange="updateDailySalary('${dateString}', this.value)">
                    ${!isDataExported(dateString, 'salary') && currentSalary > 0 ? 
                      '<div style="font-size:0.7rem; color:#f39c12; margin-top:5px;">未导出</div>' : ''}
                </div>
                `;
            }
            
            dailySalaryGrid.innerHTML = html;
            
            // 更新每日工资预览
            updateDailySalaryPreview();
            
            // 更新本月工资统计
            updateMonthSalaryStats();
            
            // 更新未导出数据预览
            updateUnexportedDataPreview();
        }
        
        // 更新每日工资
        function updateDailySalary(dateString, salary) {
            dailySalaries[dateString] = parseFloat(salary) || 0;
            
            // 清除导出记录（因为数据已更改）
            delete exportRecords[`${dateString}_salary`];
            
            // 更新本地存储
            saveDailySalaries();
            saveExportRecords();
            
            // 更新预览和统计
            updateDailySalaryPreview();
            updateMonthSalaryStats();
            
            // 显示通知
            const formattedDate = new Date(dateString).toLocaleDateString('zh-CN', {
                month: 'short',
                day: 'numeric'
            });
            showNotification('success', '工资已更新', `${formattedDate}的工资设置为${salary}元`);
        }
        
        // 应用批量工资设置
        function applyBatchSalarySettings() {
            const weekdaySalary = parseInt(document.getElementById('weekdaySalary').value) || 0;
            const weekendSalary = parseInt(document.getElementById('weekendSalary').value) || 0;
            const holidaySalary = parseInt(document.getElementById('holidaySalary').value) || 0;
            
            if (weekdaySalary === 0 && weekendSalary === 0 && holidaySalary === 0) {
                showNotification('warning', '设置失败', '请至少设置一种工资标准');
                return;
            }
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            // 设置每天的工资
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const isWeekendDay = isWeekend(currentYear, currentMonth, day);
                const isHolidayDay = isHoliday(dateString);
                
                if (isHolidayDay && holidaySalary > 0) {
                    dailySalaries[dateString] = holidaySalary;
                } else if (isWeekendDay && weekendSalary > 0) {
                    dailySalaries[dateString] = weekendSalary;
                } else if (weekdaySalary > 0) {
                    dailySalaries[dateString] = weekdaySalary;
                }
                
                // 清除导出记录（因为数据已更改）
                delete exportRecords[`${dateString}_salary`];
            }
            
            // 更新本地存储
            saveDailySalaries();
            saveExportRecords();
            
            // 更新界面
            updateDailySalaryGrid();
            updateDailySalaryPreview();
            updateMonthSalaryStats();
            
            // 显示通知
            showNotification('success', '批量设置成功', `已应用批量工资设置到${currentYear}年${currentMonth + 1}月`);
        }
        
        // 更新每日工资预览表格
        function updateDailySalaryPreview() {
            const table = document.getElementById('dailySalaryPreviewTable');
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            // 创建表格
            let html = `
            <thead>
                <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>工资(元)</th>
                    <th>类型</th>
                    <th>导出状态</th>
                </tr>
            </thead>
            <tbody>
            `;
            
            // 星期几名称
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            
            // 添加每天的行
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const dayOfWeek = getDayOfWeek(currentYear, currentMonth, day);
                const isWeekendDay = isWeekend(currentYear, currentMonth, day);
                const isHolidayDay = isHoliday(dateString);
                
                // 获取工资
                const salary = dailySalaries[dateString] || 0;
                
                // 确定类型
                let type = '工作日';
                let typeClass = '';
                if (isHolidayDay) {
                    type = '节假日';
                    typeClass = 'type-paid';
                } else if (isWeekendDay) {
                    type = '周末';
                    typeClass = 'type-paid';
                }
                
                // 导出状态
                const exported = isDataExported(dateString, 'salary');
                const exportStatus = exported ? 
                    '<span style="color:#27ae60; font-size:0.8rem;">已导出</span>' : 
                    '<span style="color:#f39c12; font-size:0.8rem;">未导出</span>';
                
                html += `
                <tr>
                    <td>${currentMonth + 1}月${day}日</td>
                    <td>星期${dayNames[dayOfWeek]}</td>
                    <td>${salary}</td>
                    <td><span class="salary-paid ${typeClass}">${type}</span></td>
                    <td>${exportStatus}</td>
                </tr>
                `;
            }
            
            html += `</tbody>`;
            table.innerHTML = html;
        }
        
        // 更新本月工资统计
        function updateMonthSalaryStats() {
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            let totalSalary = 0;
            let workdayCount = 0;
            
            // 计算总工资和工作日数
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const salary = dailySalaries[dateString] || 0;
                
                if (salary > 0) {
                    totalSalary += salary;
                    workdayCount++;
                }
            }
            
            // 更新统计显示
            document.getElementById('monthTotalSalary').textContent = totalSalary;
            document.getElementById('workdayCount').textContent = workdayCount;
            
            // 计算平均日工资
            const avgDailySalary = workdayCount > 0 ? Math.round(totalSalary / workdayCount) : 0;
            document.getElementById('avgDailySalary').textContent = avgDailySalary;
            
            // 更新员工数量
            const activeEmployees = employees.filter(e => e.active).length;
            document.getElementById('employeeCount').textContent = activeEmployees;
            
            // 更新工资图表
            updateSalaryChart();
        }
        
        // 更新工资图表
        function updateSalaryChart() {
            const chartContainer = document.getElementById('salaryChartContainer');
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            // 只显示前10天或全部天数（如果天数较少）
            const maxDaysToShow = Math.min(daysInMonth, 10);
            
            // 计算最大工资值，用于比例计算
            let maxSalary = 0;
            for (let day = 1; day <= maxDaysToShow; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const salary = dailySalaries[dateString] || 0;
                if (salary > maxSalary) maxSalary = salary;
            }
            
            // 如果最大工资为0，设置一个默认值避免除零错误
            if (maxSalary === 0) maxSalary = 1;
            
            let html = '';
            
            // 生成柱状图
            for (let day = 1; day <= maxDaysToShow; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const salary = dailySalaries[dateString] || 0;
                
                // 计算柱状图高度（最大250px）
                const barHeight = (salary / maxSalary) * 200;
                
                // 确定柱状图颜色（未导出为橙色）
                const barColor = isDataExported(dateString, 'salary') ? 
                    'linear-gradient(to top, #4b6cb7, #3498db)' : 
                    'linear-gradient(to top, #f39c12, #e67e22)';
                
                html += `
                <div class="salary-bar" style="height: ${barHeight}px; background: ${barColor};">
                    <div class="salary-bar-value">${salary}</div>
                    <div class="salary-bar-label">${day}日</div>
                </div>
                `;
            }
            
            chartContainer.innerHTML = html;
        }
        
        // 更新个人工资设置网格
        function updatePersonalSalaryGrid() {
            const personalSalaryGrid = document.getElementById('personalSalaryGrid');
            const personalSalaryMonthTitle = document.getElementById('personalSalaryMonthTitle');
            
            // 获取选中的员工
            const employeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            const selectedEmployee = employeeSelect.value;
            
            if (!selectedEmployee) {
                personalSalaryGrid.innerHTML = '<div class="empty-state">请先选择员工</div>';
                personalSalaryMonthTitle.textContent = '个人工资设置';
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('personalSalaryMonthSelect');
            const yearSelect = document.getElementById('personalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 更新月份标题
            personalSalaryMonthTitle.textContent = `${selectedYear}年${selectedMonth + 1}月 ${selectedEmployee}的个人工资设置`;
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const isCurrentMonth = today.getMonth() === selectedMonth && today.getFullYear() === selectedYear;
            
            let html = '';
            
            // 生成每天单元格
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                const dayOfWeek = getDayOfWeek(selectedYear, selectedMonth, day);
                const isWeekendDay = isWeekend(selectedYear, selectedMonth, day);
                const isHolidayDay = isHoliday(dateString);
                const isToday = isCurrentMonth && day === today.getDate();
                
                // 获取全局工资
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 获取个人工资
                const personalSalary = hasPersonalSalary(selectedEmployee, dateString) ? 
                    personalSalaries[selectedEmployee][dateString] : '';
                
                // 星期几名称
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                const dayName = dayNames[dayOfWeek];
                
                // 确定CSS类
                let cellClass = 'personal-day-cell';
                if (isWeekendDay) cellClass += ' weekend';
                if (isToday) cellClass += ' today';
                if (personalSalary !== '') cellClass += ' has-custom';
                
                // 工资信息显示
                let salaryInfo = '';
                if (personalSalary !== '') {
                    salaryInfo = `<div class="personal-salary-info personal-salary-custom">个人: ${personalSalary}元</div>`;
                } else {
                    salaryInfo = `<div class="personal-salary-info personal-salary-global">全局: ${globalSalary}元</div>`;
                }
                
                // 导出状态
                const exported = isDataExported(dateString, 'personal');
                const exportStatus = personalSalary !== '' ? 
                    (exported ? 
                        '<div style="font-size:0.7rem; color:#27ae60; margin-top:5px;">已导出</div>' : 
                        '<div style="font-size:0.7rem; color:#f39c12; margin-top:5px;">未导出</div>') : '';
                
                html += `
                <div class="${cellClass}" data-date="${dateString}">
                    <div class="personal-day-number">${day}日</div>
                    <div class="day-name">${dayName}</div>
                    <input type="number" 
                           class="personal-day-salary-input" 
                           value="${personalSalary}" 
                           min="0" 
                           step="1"
                           placeholder="${globalSalary}"
                           data-date="${dateString}"
                           data-employee="${selectedEmployee}"
                           onchange="updatePersonalSalary('${selectedEmployee}', '${dateString}', this.value)">
                    ${salaryInfo}
                    ${exportStatus}
                </div>
                `;
            }
            
            personalSalaryGrid.innerHTML = html;
            
            // 更新个人工资预览
            updatePersonalSalaryPreview();
        }
        
        // 更新个人工资
        function updatePersonalSalary(employeeName, dateString, salary) {
            // 初始化员工个人工资对象
            if (!personalSalaries[employeeName]) {
                personalSalaries[employeeName] = {};
            }
            
            if (salary === '' || salary === null || salary === undefined) {
                // 删除个人工资设置
                delete personalSalaries[employeeName][dateString];
            } else {
                // 设置个人工资
                personalSalaries[employeeName][dateString] = parseFloat(salary) || 0;
            }
            
            // 清除导出记录（因为数据已更改）
            delete exportRecords[`${dateString}_personal`];
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 更新个人工资预览
            updatePersonalSalaryPreview();
            
            // 更新个人工资设置网格中的显示
            const inputElement = document.querySelector(`input[data-date="${dateString}"][data-employee="${employeeName}"]`);
            if (inputElement) {
                const cell = inputElement.closest('.personal-day-cell');
                const globalSalary = dailySalaries[dateString] || 0;
                
                if (salary === '' || salary === null || salary === undefined) {
                    cell.classList.remove('has-custom');
                    // 更新工资信息显示
                    const infoElement = cell.querySelector('.personal-salary-info');
                    if (infoElement) {
                        infoElement.className = 'personal-salary-info personal-salary-global';
                        infoElement.textContent = `全局: ${globalSalary}元`;
                    }
                } else {
                    cell.classList.add('has-custom');
                    // 更新工资信息显示
                    const infoElement = cell.querySelector('.personal-salary-info');
                    if (infoElement) {
                        infoElement.className = 'personal-salary-info personal-salary-custom';
                        infoElement.textContent = `个人: ${salary}元`;
                    }
                }
            }
            
            // 显示通知
            const formattedDate = new Date(dateString).toLocaleDateString('zh-CN', {
                month: 'short',
                day: 'numeric'
            });
            if (salary === '' || salary === null || salary === undefined) {
                showNotification('info', '个人工资已清除', `${employeeName}在${formattedDate}的个人工资设置已清除`);
            } else {
                showNotification('success', '个人工资已更新', `${employeeName}在${formattedDate}的个人工资设置为${salary}元`);
            }
            
            // 更新未导出数据预览
            updateUnexportedDataPreview();
        }
        
        // 更新个人工资预览
        function updatePersonalSalaryPreview() {
            const table = document.getElementById('personalSalaryPreviewTable');
            const employeeNameElement = document.getElementById('personalSalaryEmployeeName');
            const monthDisplayElement = document.getElementById('personalSalaryMonthDisplay');
            const globalDaysElement = document.getElementById('personalGlobalDays');
            const customDaysElement = document.getElementById('personalCustomDays');
            const estimatedSalaryElement = document.getElementById('personalEstimatedSalary');
            
            // 获取选中的员工
            const employeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            const selectedEmployee = employeeSelect.value;
            
            if (!selectedEmployee) {
                table.innerHTML = '<tr><td colspan="4" class="empty-state">请先选择员工</td></tr>';
                employeeNameElement.textContent = '-';
                monthDisplayElement.textContent = '-';
                globalDaysElement.textContent = '0';
                customDaysElement.textContent = '0';
                estimatedSalaryElement.textContent = '0';
                updatePersonalSalaryChart();
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('personalSalaryMonthSelect');
            const yearSelect = document.getElementById('personalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 更新员工姓名和月份显示
            employeeNameElement.textContent = selectedEmployee;
            monthDisplayElement.textContent = `${selectedYear}年${selectedMonth + 1}月`;
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            // 创建表格
            let html = '';
            
            let globalDays = 0;
            let customDays = 0;
            let totalSalary = 0;
            
            // 星期几名称
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            
            // 添加每天的行
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                const dayOfWeek = getDayOfWeek(selectedYear, selectedMonth, day);
                
                // 获取全局工资
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 获取个人工资
                const hasPersonal = hasPersonalSalary(selectedEmployee, dateString);
                const personalSalary = hasPersonal ? personalSalaries[selectedEmployee][dateString] : '';
                
                // 确定最终工资
                const finalSalary = hasPersonal ? personalSalary : globalSalary;
                
                // 统计
                if (globalSalary > 0) globalDays++;
                if (hasPersonal && personalSalary !== '') customDays++;
                totalSalary += finalSalary;
                
                // 工资来源指示器
                let sourceIndicator = '<span class="salary-source global" title="全局工资"></span>';
                if (hasPersonal) {
                    sourceIndicator = '<span class="salary-source personal" title="个人工资"></span>';
                }
                
                // 导出状态
                const exported = isDataExported(dateString, 'personal');
                const exportStatus = hasPersonal ? 
                    (exported ? 
                        '<span style="color:#27ae60; font-size:0.7rem;">已导出</span>' : 
                        '<span style="color:#f39c12; font-size:0.7rem;">未导出</span>') : '';
                
                html += `
                <tr>
                    <td>${selectedMonth + 1}月${day}日 星期${dayNames[dayOfWeek]}</td>
                    <td>${globalSalary > 0 ? globalSalary + '元' : '-'}</td>
                    <td>${hasPersonal ? personalSalary + '元' : '-'}</td>
                    <td>${finalSalary > 0 ? finalSalary + '元' : '-'} ${sourceIndicator} ${exportStatus}</td>
                </tr>
                `;
            }
            
            table.innerHTML = html;
            
            // 更新统计信息
            globalDaysElement.textContent = globalDays;
            customDaysElement.textContent = customDays;
            estimatedSalaryElement.textContent = totalSalary;
            
            // 更新个人工资图表
            updatePersonalSalaryChart();
        }
        
        // 更新个人工资图表
        function updatePersonalSalaryChart() {
            const chartContainer = document.getElementById('personalSalaryChart');
            
            // 获取选中的员工
            const employeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            const selectedEmployee = employeeSelect.value;
            
            if (!selectedEmployee) {
                chartContainer.innerHTML = '<div class="empty-state">请先选择员工</div>';
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('personalSalaryMonthSelect');
            const yearSelect = document.getElementById('personalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            // 只显示前10天或全部天数（如果天数较少）
            const maxDaysToShow = Math.min(daysInMonth, 10);
            
            // 计算每天的个人工资和全局工资
            const personalSalariesData = [];
            const globalSalariesData = [];
            
            for (let day = 1; day <= maxDaysToShow; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                
                // 获取全局工资
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 获取个人工资
                const hasPersonal = hasPersonalSalary(selectedEmployee, dateString);
                const personalSalary = hasPersonal ? personalSalaries[selectedEmployee][dateString] : globalSalary;
                
                personalSalariesData.push(personalSalary);
                globalSalariesData.push(globalSalary);
            }
            
            // 计算最大工资值，用于比例计算
            let maxSalary = 0;
            personalSalariesData.forEach(salary => {
                if (salary > maxSalary) maxSalary = salary;
            });
            globalSalariesData.forEach(salary => {
                if (salary > maxSalary) maxSalary = salary;
            });
            
            // 如果最大工资为0，设置一个默认值避免除零错误
            if (maxSalary === 0) maxSalary = 1;
            
            let html = '';
            
            // 生成柱状图
            for (let day = 1; day <= maxDaysToShow; day++) {
                const personalSalary = personalSalariesData[day - 1] || 0;
                const globalSalary = globalSalariesData[day - 1] || 0;
                const hasPersonal = hasPersonalSalary(selectedEmployee, formatDate(selectedYear, selectedMonth, day));
                const dateString = formatDate(selectedYear, selectedMonth, day);
                const exported = isDataExported(dateString, 'personal');
                
                // 计算柱状图高度（最大250px）
                const barHeight = (personalSalary / maxSalary) * 200;
                
                // 柱状图颜色
                let barColor = 'linear-gradient(to top, #4b6cb7, #3498db)';
                if (hasPersonal && personalSalary !== globalSalary) {
                    barColor = exported ? 
                        'linear-gradient(to top, #9b59b6, #8e44ad)' : 
                        'linear-gradient(to top, #f39c12, #e67e22)';
                }
                
                html += `
                <div class="salary-bar" style="height: ${barHeight}px; background: ${barColor};">
                    <div class="salary-bar-value">${personalSalary > 0 ? personalSalary : ''}</div>
                    <div class="salary-bar-label">${day}日</div>
                </div>
                `;
            }
            
            chartContainer.innerHTML = html;
        }
        
        // 应用统一个人工资设置
        function applyUniformPersonalSalary() {
            // 获取选中的员工
            const employeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            const selectedEmployee = employeeSelect.value;
            
            if (!selectedEmployee) {
                showNotification('warning', '设置失败', '请先选择员工');
                return;
            }
            
            // 获取统一工资值
            const uniformSalary = parseInt(document.getElementById('personalUniformSalary').value) || 0;
            
            if (uniformSalary <= 0) {
                showNotification('warning', '设置失败', '请输入有效的工资数值');
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('personalSalaryMonthSelect');
            const yearSelect = document.getElementById('personalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            // 初始化员工个人工资对象
            if (!personalSalaries[selectedEmployee]) {
                personalSalaries[selectedEmployee] = {};
            }
            
            // 设置每天的工资
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                personalSalaries[selectedEmployee][dateString] = uniformSalary;
                
                // 清除导出记录（因为数据已更改）
                delete exportRecords[`${dateString}_personal`];
            }
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 更新界面
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            
            // 显示通知
            showNotification('success', '个人工资设置成功', `${selectedEmployee}在${selectedYear}年${selectedMonth + 1}月的个人工资已统一设置为${uniformSalary}元`);
        }
        
        // 清除个人工资设置
        function clearPersonalSalaries() {
            // 获取选中的员工
            const employeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            const selectedEmployee = employeeSelect.value;
            
            if (!selectedEmployee) {
                showNotification('warning', '清除失败', '请先选择员工');
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('personalSalaryMonthSelect');
            const yearSelect = document.getElementById('personalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            // 清除每天的工资设置
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                if (personalSalaries[selectedEmployee] && personalSalaries[selectedEmployee][dateString] !== undefined) {
                    delete personalSalaries[selectedEmployee][dateString];
                    
                    // 清除导出记录
                    delete exportRecords[`${dateString}_personal`];
                }
            }
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 更新界面
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            
            // 显示通知
            showNotification('success', '个人工资已清除', `${selectedEmployee}在${selectedYear}年${selectedMonth + 1}月的个人工资设置已清除`);
        }
        
        // 复制全局设置到个人
        function copyGlobalToPersonal() {
            // 获取选中的员工
            const employeeSelect = document.getElementById('personalSalaryEmployeeSelect');
            const selectedEmployee = employeeSelect.value;
            
            if (!selectedEmployee) {
                showNotification('warning', '复制失败', '请先选择员工');
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('personalSalaryMonthSelect');
            const yearSelect = document.getElementById('personalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            // 初始化员工个人工资对象
            if (!personalSalaries[selectedEmployee]) {
                personalSalaries[selectedEmployee] = {};
            }
            
            // 复制每天的工资设置
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                const globalSalary = dailySalaries[dateString] || 0;
                
                if (globalSalary > 0) {
                    personalSalaries[selectedEmployee][dateString] = globalSalary;
                    
                    // 清除导出记录（因为数据已更改）
                    delete exportRecords[`${dateString}_personal`];
                }
            }
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 更新界面
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            
            // 显示通知
            showNotification('success', '复制成功', `已将全局工资设置复制到${selectedEmployee}的个人工资设置`);
        }
        
        // 保存个人工资设置
        function savePersonalSalarySettings() {
            savePersonalSalaries();
            showNotification('success', '保存成功', '个人工资设置已保存');
            document.getElementById('personalSalaryModal').classList.remove('active');
        }
        
        // 显示批量管理个人工资模态框
        function showBulkPersonalSalaryModal() {
            const modalContent = document.getElementById('bulkPersonalSalaryModalContent');
            
            let html = `
                <div class="form-group">
                    <label>选择员工（可多选）</label>
                    <div class="employee-selector" id="bulkPersonalSalaryEmployeeSelector">
            `;
            
            // 添加员工复选框
            employees.forEach((employee, index) => {
                if (!employee.active) return;
                
                html += `
                    <div class="employee-checkbox">
                        <input type="checkbox" id="bulkEmployee${index}" checked>
                        <label for="bulkEmployee${index}">${employee.name}</label>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
                
                <div class="form-group">
                    <label>选择月份</label>
                    <div class="personal-salary-selector">
                        <select id="bulkPersonalSalaryMonthSelect">
            `;
            
            // 添加月份选项
            const months = [
                '1月', '2月', '3月', '4月', '5月', '6月',
                '7月', '8月', '9月', '10月', '11月', '12月'
            ];
            
            months.forEach((month, index) => {
                const selected = index === currentMonth ? 'selected' : '';
                html += `<option value="${index}" ${selected}>${month}</option>`;
            });
            
            html += `
                        </select>
                        <select id="bulkPersonalSalaryYearSelect">
            `;
            
            // 添加年份选项（从2026年开始）
            for (let year = 2026; year <= 2030; year++) {
                const selected = year === currentYear ? 'selected' : '';
                html += `<option value="${year}" ${selected}>${year}年</option>`;
            }
            
            html += `
                        </select>
                    </div>
                </div>
                
                <div class="personal-batch-settings">
                    <h3>批量设置选项</h3>
                    <div class="batch-setting-group">
                        <label>设置类型：</label>
                        <select id="bulkPersonalSalaryType">
                            <option value="uniform">统一设置工资</option>
                            <option value="clear">清除个人设置</option>
                            <option value="copy">复制全局设置</option>
                        </select>
                    </div>
                    
                    <div class="batch-setting-group" id="bulkUniformSalaryGroup">
                        <label>统一工资：</label>
                        <input type="number" id="bulkUniformSalary" min="0" step="1" placeholder="如：180">
                    </div>
                    
                    <div class="quick-actions">
                        <button class="btn btn-primary" id="previewBulkPersonalSalaries">预览设置</button>
                    </div>
                </div>
                
                <div id="bulkPersonalSalaryPreview" style="margin-top: 20px; display: none;">
                    <h3>设置预览</h3>
                    <div id="bulkPersonalSalaryPreviewContent"></div>
                </div>
            `;
            
            modalContent.innerHTML = html;
            
            // 设置事件监听器
            document.getElementById('bulkPersonalSalaryType').addEventListener('change', function() {
                const type = this.value;
                const uniformSalaryGroup = document.getElementById('bulkUniformSalaryGroup');
                if (type === 'uniform') {
                    uniformSalaryGroup.style.display = 'flex';
                } else {
                    uniformSalaryGroup.style.display = 'none';
                }
            });
            
            document.getElementById('previewBulkPersonalSalaries').addEventListener('click', previewBulkPersonalSalaries);
            
            // 显示模态框
            document.getElementById('bulkPersonalSalaryModal').classList.add('active');
        }
        
        // 预览批量个人工资设置
        function previewBulkPersonalSalaries() {
            const previewContent = document.getElementById('bulkPersonalSalaryPreviewContent');
            const previewContainer = document.getElementById('bulkPersonalSalaryPreview');
            
            // 获取设置类型
            const type = document.getElementById('bulkPersonalSalaryType').value;
            
            // 获取选中的员工
            const selectedEmployees = [];
            document.querySelectorAll('#bulkPersonalSalaryEmployeeSelector input[type="checkbox"]').forEach((checkbox, index) => {
                if (checkbox.checked) {
                    selectedEmployees.push(employees[index].name);
                }
            });
            
            if (selectedEmployees.length === 0) {
                showNotification('warning', '预览失败', '请至少选择一个员工');
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('bulkPersonalSalaryMonthSelect');
            const yearSelect = document.getElementById('bulkPersonalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            let html = '';
            
            if (type === 'uniform') {
                // 统一设置工资
                const uniformSalary = parseInt(document.getElementById('bulkUniformSalary').value) || 0;
                
                if (uniformSalary <= 0) {
                    showNotification('warning', '预览失败', '请输入有效的工资数值');
                    return;
                }
                
                html = `
                    <p><strong>设置类型：</strong>统一设置个人工资</p>
                    <p><strong>工资金额：</strong>${uniformSalary}元/天</p>
                    <p><strong>目标员工：</strong>${selectedEmployees.join(', ')}</p>
                    <p><strong>设置月份：</strong>${selectedYear}年${selectedMonth + 1}月</p>
                    <p><strong>影响天数：</strong>${daysInMonth}天</p>
                    <p><strong>总计影响：</strong>${selectedEmployees.length}个员工 × ${daysInMonth}天 = ${selectedEmployees.length * daysInMonth}个工资项</p>
                `;
                
            } else if (type === 'clear') {
                // 清除个人设置
                html = `
                    <p><strong>设置类型：</strong>清除个人工资设置</p>
                    <p><strong>目标员工：</strong>${selectedEmployees.join(', ')}</p>
                    <p><strong>设置月份：</strong>${selectedYear}年${selectedMonth + 1}月</p>
                    <p><strong>清除后：</strong>这些员工将使用全局工资设置</p>
                `;
                
            } else if (type === 'copy') {
                // 复制全局设置
                html = `
                    <p><strong>设置类型：</strong>复制全局工资设置到个人</p>
                    <p><strong>目标员工：</strong>${selectedEmployees.join(', ')}</p>
                    <p><strong>设置月份：</strong>${selectedYear}年${selectedMonth + 1}月</p>
                    <p><strong>复制后：</strong>这些员工的个人工资将与全局工资一致</p>
                `;
            }
            
            previewContent.innerHTML = html;
            previewContainer.style.display = 'block';
        }
        
        // 应用批量个人工资设置
        function applyBulkPersonalSalarySettings() {
            // 获取设置类型
            const type = document.getElementById('bulkPersonalSalaryType').value;
            
            // 获取选中的员工
            const selectedEmployees = [];
            document.querySelectorAll('#bulkPersonalSalaryEmployeeSelector input[type="checkbox"]').forEach((checkbox, index) => {
                if (checkbox.checked) {
                    selectedEmployees.push(employees[index].name);
                }
            });
            
            if (selectedEmployees.length === 0) {
                showNotification('warning', '设置失败', '请至少选择一个员工');
                return;
            }
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('bulkPersonalSalaryMonthSelect');
            const yearSelect = document.getElementById('bulkPersonalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            
            // 执行批量设置
            selectedEmployees.forEach(employeeName => {
                // 初始化员工个人工资对象
                if (!personalSalaries[employeeName]) {
                    personalSalaries[employeeName] = {};
                }
                
                if (type === 'uniform') {
                    // 统一设置工资
                    const uniformSalary = parseInt(document.getElementById('bulkUniformSalary').value) || 0;
                    
                    if (uniformSalary <= 0) {
                        showNotification('warning', '设置失败', '请输入有效的工资数值');
                        return;
                    }
                    
                    // 设置每天的工资
                    for (let day = 1; day <= daysInMonth; day++) {
                        const dateString = formatDate(selectedYear, selectedMonth, day);
                        personalSalaries[employeeName][dateString] = uniformSalary;
                        
                        // 清除导出记录（因为数据已更改）
                        delete exportRecords[`${dateString}_personal`];
                    }
                    
                } else if (type === 'clear') {
                    // 清除个人设置
                    for (let day = 1; day <= daysInMonth; day++) {
                        const dateString = formatDate(selectedYear, selectedMonth, day);
                        if (personalSalaries[employeeName][dateString] !== undefined) {
                            delete personalSalaries[employeeName][dateString];
                            
                            // 清除导出记录
                            delete exportRecords[`${dateString}_personal`];
                        }
                    }
                    
                } else if (type === 'copy') {
                    // 复制全局设置
                    for (let day = 1; day <= daysInMonth; day++) {
                        const dateString = formatDate(selectedYear, selectedMonth, day);
                        const globalSalary = dailySalaries[dateString] || 0;
                        
                        if (globalSalary > 0) {
                            personalSalaries[employeeName][dateString] = globalSalary;
                            
                            // 清除导出记录（因为数据已更改）
                            delete exportRecords[`${dateString}_personal`];
                        }
                    }
                }
            });
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 关闭模态框
            document.getElementById('bulkPersonalSalaryModal').classList.remove('active');
            
            // 显示通知
            showNotification('success', '批量设置成功', `已为${selectedEmployees.length}个员工应用了批量个人工资设置`);
            
            // 如果当前在个人工资设置页面，更新显示
            if (document.getElementById('tabPersonalSalaryContent').classList.contains('active')) {
                updatePersonalSalaryGrid();
                updatePersonalSalaryPreview();
            }
        }
        
        // 保存出勤记录
        function saveAttendance() {
            const attendanceDate = document.getElementById('attendanceDate').value;
            
            if (!attendanceDate) {
                showNotification('error', '保存失败', '请选择日期');
                return;
            }
            
            // 初始化该日期的出勤记录
            if (!attendanceRecords[attendanceDate]) {
                attendanceRecords[attendanceDate] = {};
            }
            
            // 获取选中的员工
            const selectedEmployees = [];
            document.querySelectorAll('#attendanceEmployeeSelector input[type="checkbox"]').forEach((checkbox, index) => {
                if (checkbox.checked) {
                    selectedEmployees.push(employees[index].name);
                }
            });
            
            // 如果没选员工，默认选择所有员工
            const targetEmployees = selectedEmployees.length > 0 ? selectedEmployees : employees.map(e => e.name);
            
            // 设置出勤状态
            targetEmployees.forEach(employeeName => {
                attendanceRecords[attendanceDate][employeeName] = true;
            });
            
            // 清除导出记录（因为数据已更改）
            delete exportRecords[`${attendanceDate}_attendance`];
            
            // 保存到本地存储
            saveAttendanceRecords();
            saveExportRecords();
            
            // 显示成功通知
            const formattedDate = new Date(attendanceDate).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            showNotification('success', '出勤记录已保存', `${formattedDate}的出勤记录已保存`);
            
            // 更新出勤日历和统计
            updateAttendanceCalendar();
            updateAttendanceStats();
            updateAttendanceEmployeeSummary();
            
            // 更新未导出数据预览
            updateUnexportedDataPreview();
        }
        
        // 清除今日出勤记录
        function clearTodayAttendance() {
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const todayStr = today.toISOString().split('T')[0];
            
            if (attendanceRecords[todayStr]) {
                delete attendanceRecords[todayStr];
                delete exportRecords[`${todayStr}_attendance`];
                saveAttendanceRecords();
                saveExportRecords();
                showNotification('success', '记录已清除', '今日出勤记录已清除');
                
                // 更新界面
                updateAttendanceCalendar();
                updateAttendanceStats();
                updateAttendanceEmployeeSummary();
                updateUnexportedDataPreview();
            } else {
                showNotification('info', '无记录', '今日无出勤记录');
            }
        }
        
        // 更新出勤日历
        function updateAttendanceCalendar() {
            const attendanceCalendar = document.getElementById('attendanceCalendar');
            
            // 获取当前月份的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
            
            // 创建日历头部
            let html = `
            <div class="calendar-header">
                <div class="calendar-day-header">日</div>
                <div class="calendar-day-header">一</div>
                <div class="calendar-day-header">二</div>
                <div class="calendar-day-header">三</div>
                <div class="calendar-day-header">四</div>
                <div class="calendar-day-header">五</div>
                <div class="calendar-day-header">六</div>
            </div>
            <div class="calendar-body">
            `;
            
            // 获取第一天是星期几
            const firstDayOfWeek = getDayOfWeek(currentYear, currentMonth, 1);
            
            // 添加空白单元格（如果第一天不是周日）
            for (let i = 0; i < firstDayOfWeek; i++) {
                html += '<div class="calendar-day calendar-day-empty"></div>';
            }
            
            // 添加每天单元格
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const isWeekendDay = isWeekend(currentYear, currentMonth, day);
                const isToday = isCurrentMonth && day === today.getDate();
                
                // 确定CSS类
                let dayClass = 'calendar-day';
                if (isWeekendDay) dayClass += ' weekend';
                if (isToday) dayClass += ' today';
                
                // 获取该日期的工资
                const salary = dailySalaries[dateString] || 0;
                
                // 获取该日期的出勤员工数
                const attendanceCount = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]).length : 0;
                
                // 导出状态
                const exported = isDataExported(dateString, 'attendance');
                const exportStatus = attendanceCount > 0 ? 
                    (exported ? 
                        '<div style="font-size:0.7rem; color:#27ae60;">已导出</div>' : 
                        '<div style="font-size:0.7rem; color:#f39c12;">未导出</div>') : '';
                
                html += `
                <div class="${dayClass}" data-date="${dateString}">
                    <div class="calendar-day-number">${day}</div>
                    <div class="calendar-day-salary">${salary > 0 ? salary + '元' : '未设置'}</div>
                    <div class="calendar-day-employees">
                        ${attendanceCount > 0 ? attendanceCount + '人出勤' : '无出勤记录'}
                    </div>
                    ${exportStatus}
                </div>
                `;
            }
            
            html += `</div>`;
            attendanceCalendar.innerHTML = html;
        }
        
        // 更新员工出勤摘要
        function updateAttendanceEmployeeSummary() {
            const employeeSummary = document.getElementById('attendanceEmployeeSummary');
            
            let html = '';
            
            employees.forEach(employee => {
                if (!employee.active) return;
                
                const employeeName = employee.name;
                
                // 计算该员工的出勤天数
                let attendanceDays = 0;
                for (const date in attendanceRecords) {
                    if (attendanceRecords[date][employeeName]) {
                        attendanceDays++;
                    }
                }
                
                html += `
                <div class="employee-item">
                    <div class="employee-name">${employeeName}</div>
                    <div class="employee-salary">${attendanceDays} 天</div>
                    <div class="employee-workdays">出勤天数</div>
                </div>
                `;
            });
            
            employeeSummary.innerHTML = html;
        }
        
        // 更新出勤统计表格
        function updateAttendanceStats() {
            const tableBody = document.getElementById('attendanceStatsTable');
            
            let html = '';
            
            employees.forEach(employee => {
                if (!employee.active) return;
                
                const employeeName = employee.name;
                
                // 计算该员工的出勤和缺勤天数
                let attendanceDays = 0;
                let absentDays = 0;
                
                // 获取该月的天数
                const daysInMonth = getDaysInMonth(currentYear, currentMonth);
                
                for (let day = 1; day <= daysInMonth; day++) {
                    const dateString = formatDate(currentYear, currentMonth, day);
                    
                    if (attendanceRecords[dateString]) {
                        if (attendanceRecords[dateString][employeeName]) {
                            attendanceDays++;
                        } else {
                            // 如果该日期有出勤记录但该员工没有记录，则视为缺勤
                            absentDays++;
                        }
                    }
                }
                
                // 计算出勤率
                const totalDays = attendanceDays + absentDays;
                const attendanceRate = totalDays > 0 ? Math.round((attendanceDays / totalDays) * 100) : 0;
                
                html += `
                <tr>
                    <td>${employeeName}</td>
                    <td>${attendanceDays}</td>
                    <td>${absentDays}</td>
                    <td>${attendanceRate}%</td>
                </tr>
                `;
            });
            
            tableBody.innerHTML = html;
        }
        
        // 更新工资汇总表格
        function updateSalarySummaryTables() {
            updateEmployeeSalarySummary();
            updateDailySalarySummary();
            updateDetailedSalaryTable();
            updatePersonalSalaryDetails();
        }
        
        // 更新员工工资汇总表格
        function updateEmployeeSalarySummary() {
            const tableBody = document.getElementById('employeeSalarySummaryTable');
            
            let html = '';
            let grandTotalSalary = 0;
            
            employees.forEach(employee => {
                if (!employee.active) return;
                
                const employeeName = employee.name;
                
                // 计算该员工的总工资和出勤天数
                let totalSalary = 0;
                let attendanceDays = 0;
                let personalSalaryDays = 0;
                
                // 遍历所有日期
                for (const dateString in dailySalaries) {
                    const globalSalary = dailySalaries[dateString];
                    if (globalSalary > 0 && attendanceRecords[dateString] && attendanceRecords[dateString][employeeName]) {
                        // 获取员工该日的工资（优先个人设置）
                        const employeeSalary = getEmployeeSalary(employeeName, dateString);
                        totalSalary += employeeSalary;
                        attendanceDays++;
                        
                        // 统计个人工资天数
                        if (hasPersonalSalary(employeeName, dateString)) {
                            personalSalaryDays++;
                        }
                    }
                }
                
                grandTotalSalary += totalSalary;
                
                // 计算平均日工资
                const avgDailySalary = attendanceDays > 0 ? Math.round(totalSalary / attendanceDays) : 0;
                
                // 工资来源说明
                let salarySource = '全局工资';
                if (personalSalaryDays > 0) {
                    if (personalSalaryDays === attendanceDays) {
                        salarySource = '个人工资';
                    } else {
                        salarySource = `混合 (${personalSalaryDays}天个人)`;
                    }
                }
                
                html += `
                <tr>
                    <td>${employeeName}</td>
                    <td>${attendanceDays}</td>
                    <td class="total-column">${totalSalary}</td>
                    <td>${avgDailySalary}</td>
                    <td>${salarySource}</td>
                </tr>
                `;
            });
            
            // 添加总计行
            html += `
            <tr>
                <td><strong>总计</strong></td>
                <td>-</td>
                <td class="total-column"><strong>${grandTotalSalary}</strong></td>
                <td>-</td>
                <td>-</td>
            </tr>
            `;
            
            tableBody.innerHTML = html;
        }
        
        // 更新每日工资汇总表格
        function updateDailySalarySummary() {
            const tableBody = document.getElementById('dailySalarySummaryTable');
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            let html = '';
            let monthTotalSalary = 0;
            
            // 星期几名称
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const dayOfWeek = getDayOfWeek(currentYear, currentMonth, day);
                
                // 获取该日期的全局工资
                const dailyGlobalSalary = dailySalaries[dateString] || 0;
                
                // 获取该日期的出勤员工
                const attendanceEmployees = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]) : [];
                
                // 计算当日总工资（考虑个人工资设置）
                let dailyTotalSalary = 0;
                attendanceEmployees.forEach(employeeName => {
                    const employeeSalary = getEmployeeSalary(employeeName, dateString);
                    dailyTotalSalary += employeeSalary;
                });
                
                monthTotalSalary += dailyTotalSalary;
                
                // 计算平均工资
                const avgSalary = attendanceEmployees.length > 0 ? 
                    Math.round(dailyTotalSalary / attendanceEmployees.length) : 0;
                
                // 格式化日期
                const formattedDate = `${currentMonth + 1}月${day}日 (星期${dayNames[dayOfWeek]})`;
                
                html += `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${attendanceEmployees.length}</td>
                    <td class="total-column">${dailyTotalSalary}</td>
                    <td>${avgSalary}</td>
                </tr>
                `;
            }
            
            // 添加总计行
            html += `
            <tr>
                <td><strong>本月总计</strong></td>
                <td>-</td>
                <td class="total-column"><strong>${monthTotalSalary}</strong></td>
                <td>-</td>
            </tr>
            `;
            
            tableBody.innerHTML = html;
        }
        
        // 更新详细工资表格
        function updateDetailedSalaryTable() {
            const table = document.getElementById('detailedSalaryTable');
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            // 创建表格
            let html = `
            <thead>
                <tr>
                    <th>员工</th>
            `;
            
            // 添加日期列
            for (let day = 1; day <= daysInMonth; day++) {
                html += `<th>${day}日</th>`;
            }
            
            html += `
                    <th>总计</th>
                </tr>
            </thead>
            <tbody>
            `;
            
            // 为每个员工添加行
            employees.forEach(employee => {
                if (!employee.active) return;
                
                const employeeName = employee.name;
                let rowTotal = 0;
                
                html += `<tr><td><strong>${employeeName}</strong></td>`;
                
                // 为每个日期添加单元格
                for (let day = 1; day <= daysInMonth; day++) {
                    const dateString = formatDate(currentYear, currentMonth, day);
                    const globalSalary = dailySalaries[dateString] || 0;
                    
                    // 检查员工是否出勤
                    const isPresent = attendanceRecords[dateString] && attendanceRecords[dateString][employeeName];
                    
                    // 获取员工该日的工资（优先个人设置）
                    const employeeSalary = isPresent ? getEmployeeSalary(employeeName, dateString) : 0;
                    
                    rowTotal += employeeSalary;
                    
                    // 确定单元格内容
                    let cellContent = '-';
                    let cellTitle = '';
                    
                    if (employeeSalary > 0) {
                        cellContent = employeeSalary;
                        
                        // 添加提示信息
                        if (hasPersonalSalary(employeeName, dateString)) {
                            cellTitle = `个人设置: ${employeeSalary}元 (全局: ${globalSalary}元)`;
                        } else {
                            cellTitle = `全局设置: ${employeeSalary}元`;
                        }
                    }
                    
                    html += `<td title="${cellTitle}">${cellContent}</td>`;
                }
                
                html += `<td class="total-column">${rowTotal}</td></tr>`;
            });
            
            // 添加总计行
            html += `<tr><td><strong>每日总计</strong></td>`;
            
            let grandTotal = 0;
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const globalSalary = dailySalaries[dateString] || 0;
                const attendanceEmployees = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]) : [];
                
                // 计算当日总工资（考虑个人工资设置）
                let dailyTotal = 0;
                attendanceEmployees.forEach(employeeName => {
                    const employeeSalary = getEmployeeSalary(employeeName, dateString);
                    dailyTotal += employeeSalary;
                });
                
                grandTotal += dailyTotal;
                
                html += `<td class="total-column">${dailyTotal}</td>`;
            }
            
            html += `<td class="total-column"><strong>${grandTotal}</strong></td></tr>`;
            html += `</tbody>`;
            
            table.innerHTML = html;
        }
        
        // 更新个人工资详情
        function updatePersonalSalaryDetails() {
            const container = document.getElementById('personalSalaryDetails');
            
            let html = '';
            
            employees.forEach(employee => {
                if (!employee.active) return;
                
                const employeeName = employee.name;
                
                // 计算该员工的个人工资统计
                let personalSalaryDays = 0;
                let totalPersonalSalary = 0;
                let totalGlobalSalary = 0;
                let attendanceDays = 0;
                
                // 遍历所有日期
                for (const dateString in dailySalaries) {
                    const globalSalary = dailySalaries[dateString];
                    if (globalSalary > 0 && attendanceRecords[dateString] && attendanceRecords[dateString][employeeName]) {
                        attendanceDays++;
                        
                        // 获取员工该日的工资
                        const employeeSalary = getEmployeeSalary(employeeName, dateString);
                        
                        if (hasPersonalSalary(employeeName, dateString)) {
                            personalSalaryDays++;
                            totalPersonalSalary += employeeSalary;
                        } else {
                            totalGlobalSalary += employeeSalary;
                        }
                    }
                }
                
                // 只显示有个人工资设置的员工
                if (personalSalaryDays === 0) return;
                
                const totalSalary = totalPersonalSalary + totalGlobalSalary;
                const personalSalaryPercent = totalSalary > 0 ? 
                    Math.round((totalPersonalSalary / totalSalary) * 100) : 0;
                
                html += `
                <div class="employee-salary-detail">
                    <div class="employee-salary-header">
                        <div class="employee-salary-name">${employeeName}</div>
                        <div class="employee-salary-total">${totalSalary}元</div>
                    </div>
                    <div class="salary-comparison">
                        <div class="global-salary">
                            <strong>全局工资：</strong>${totalGlobalSalary}元
                        </div>
                        <div class="personal-salary-indicator">
                            <strong>个人工资：</strong>${totalPersonalSalary}元 (${personalSalaryPercent}%)
                        </div>
                    </div>
                    <div class="employee-workdays">
                        出勤${attendanceDays}天，其中${personalSalaryDays}天使用个人工资设置
                    </div>
                </div>
                `;
            });
            
            if (html === '') {
                html = '<div class="empty-state">暂无员工使用个人工资设置</div>';
            }
            
            container.innerHTML = html;
        }
        
        // 更新日历视图
        function updateCalendarView() {
            const calendarView = document.getElementById('calendarView');
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
            
            // 创建日历头部
            let html = `
            <div class="calendar-header">
                <div class="calendar-day-header">日</div>
                <div class="calendar-day-header">一</div>
                <div class="calendar-day-header">二</div>
                <div class="calendar-day-header">三</div>
                <div class="calendar-day-header">四</div>
                <div class="calendar-day-header">五</div>
                <div class="calendar-day-header">六</div>
            </div>
            <div class="calendar-body">
            `;
            
            // 获取第一天是星期几
            const firstDayOfWeek = getDayOfWeek(currentYear, currentMonth, 1);
            
            // 添加空白单元格（如果第一天不是周日）
            for (let i = 0; i < firstDayOfWeek; i++) {
                html += '<div class="calendar-day calendar-day-empty"></div>';
            }
            
            // 添加每天单元格
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const isWeekendDay = isWeekend(currentYear, currentMonth, day);
                const isToday = isCurrentMonth && day === today.getDate();
                
                // 确定CSS类
                let dayClass = 'calendar-day';
                if (isWeekendDay) dayClass += ' weekend';
                if (isToday) dayClass += ' today';
                
                // 获取该日期的全局工资
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 获取该日期的出勤员工
                const attendanceEmployees = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]) : [];
                
                // 计算使用个人工资的员工数
                let personalSalaryCount = 0;
                attendanceEmployees.forEach(employeeName => {
                    if (hasPersonalSalary(employeeName, dateString)) {
                        personalSalaryCount++;
                    }
                });
                
                html += `
                <div class="${dayClass}" data-date="${dateString}">
                    <div class="calendar-day-number">${day}</div>
                    <div class="calendar-day-salary">${globalSalary > 0 ? globalSalary + '元' : '未设置'}</div>
                    <div class="calendar-day-employees">
                        ${attendanceEmployees.length > 0 ? 
                            `${attendanceEmployees.length}人出勤` : 
                            '无出勤'}
                    </div>
                    ${personalSalaryCount > 0 ? 
                        `<div style="font-size: 0.8rem; color: #9b59b6; margin-top: 5px;">${personalSalaryCount}人使用个人工资</div>` : 
                        ''}
                </div>
                `;
            }
            
            html += `</div>`;
            calendarView.innerHTML = html;
        }
        
        // 更新日历统计
        function updateCalendarStats() {
            // 计算本月总支出
            let totalSalary = 0;
            let totalAttendanceDays = 0;
            let personalSalaryCount = 0;
            
            // 遍历所有日期
            for (const dateString in dailySalaries) {
                const globalSalary = dailySalaries[dateString];
                if (globalSalary > 0 && attendanceRecords[dateString]) {
                    const attendanceEmployees = Object.keys(attendanceRecords[dateString]);
                    attendanceEmployees.forEach(employeeName => {
                        // 获取员工该日的工资（优先个人设置）
                        const employeeSalary = getEmployeeSalary(employeeName, dateString);
                        totalSalary += employeeSalary;
                        totalAttendanceDays++;
                        
                        // 统计使用个人工资的次数
                        if (hasPersonalSalary(employeeName, dateString)) {
                            personalSalaryCount++;
                        }
                    });
                }
            }
            
            // 计算人均工资
            const activeEmployees = employees.filter(e => e.active).length;
            const avgSalary = activeEmployees > 0 ? Math.round(totalSalary / activeEmployees) : 0;
            
            // 更新显示
            document.getElementById('calendarTotalSalary').textContent = totalSalary;
            document.getElementById('calendarAvgSalary').textContent = avgSalary;
            document.getElementById('calendarAttendanceDays').textContent = totalAttendanceDays;
            
            // 更新工资趋势图
            updateSalaryTrendChart();
        }
        
        // 更新工资趋势图
        function updateSalaryTrendChart() {
            const chartContainer = document.getElementById('salaryTrendChart');
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            // 计算每天的总工资支出
            const dailyTotals = [];
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                const globalSalary = dailySalaries[dateString] || 0;
                const attendanceEmployees = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]) : [];
                
                // 计算当日总工资（考虑个人工资设置）
                let dailyTotal = 0;
                attendanceEmployees.forEach(employeeName => {
                    const employeeSalary = getEmployeeSalary(employeeName, dateString);
                    dailyTotal += employeeSalary;
                });
                
                dailyTotals.push(dailyTotal);
            }
            
            // 计算最大支出值，用于比例计算
            let maxTotal = 0;
            dailyTotals.forEach(total => {
                if (total > maxTotal) maxTotal = total;
            });
            
            // 如果最大支出为0，设置一个默认值避免除零错误
            if (maxTotal === 0) maxTotal = 1;
            
            let html = '';
            
            // 生成柱状图（最多显示15天）
            const daysToShow = Math.min(daysInMonth, 15);
            for (let day = 1; day <= daysToShow; day++) {
                const total = dailyTotals[day - 1] || 0;
                const dateString = formatDate(currentYear, currentMonth, day);
                const exported = isDataExported(dateString, 'salary');
                
                // 计算柱状图高度（最大250px）
                const barHeight = (total / maxTotal) * 200;
                
                // 柱状图颜色
                const barColor = exported ? 
                    'linear-gradient(to top, #4b6cb7, #3498db)' : 
                    'linear-gradient(to top, #f39c12, #e67e22)';
                
                html += `
                <div class="salary-bar" style="height: ${barHeight}px; background: ${barColor};">
                    <div class="salary-bar-value">${total > 0 ? total : ''}</div>
                    <div class="salary-bar-label">${day}日</div>
                </div>
                `;
            }
            
            chartContainer.innerHTML = html;
        }
        
        // 更新员工管理列表
        function updateEmployeeManagementList() {
            const container = document.getElementById('employeeManagementList');
            
            let html = '<table style="width: 100%;"><thead><tr><th>姓名</th><th>身份证号</th><th>状态</th><th>操作</th></tr></thead><tbody>';
            
            employees.forEach((employee, index) => {
                // 统计个人工资设置天数
                let personalSalaryDays = 0;
                if (personalSalaries[employee.name]) {
                    personalSalaryDays = Object.keys(personalSalaries[employee.name]).length;
                }
                
                html += `
                <tr>
                    <td>${employee.name}</td>
                    <td><input type="text" class="id-card-input" value="${employee.idCard || ''}" onchange="updateEmployeeIdCard(${index}, this.value)"></td>
                    <td>${employee.active ? '启用' : '禁用'}</td>
                    <td>
                        <button class="btn btn-sm ${employee.active ? 'btn-warning' : 'btn-success'}" 
                                onclick="toggleEmployeeStatus(${index})">
                            ${employee.active ? '禁用' : '启用'}
                        </button>
                        <button class="btn btn-sm btn-info" 
                                onclick="openPersonalSalaryModal('${employee.name}')"
                                ${!employee.active ? 'disabled' : ''}>
                            ${personalSalaryDays > 0 ? '修改个人工资' : '设置个人工资'}
                        </button>
                    </td>
                </tr>
                `;
            });
            
            html += '</tbody></table>';
            
            container.innerHTML = html;
        }
        
        // 更新员工身份证号
        function updateEmployeeIdCard(index, idCard) {
            employees[index].idCard = idCard;
            saveEmployees();
            showNotification('success', '身份证号已更新', `${employees[index].name}的身份证号已更新`);
        }
        
        // 切换员工状态
        function toggleEmployeeStatus(index) {
            employees[index].active = !employees[index].active;
            saveEmployees();
            updateEmployeeManagementList();
            
            const status = employees[index].active ? '启用' : '禁用';
            showNotification('success', '状态已更新', `员工${employees[index].name}已${status}`);
        }
        
        // 打开个人工资设置模态框
        function openPersonalSalaryModal(employeeName) {
            const modalContent = document.getElementById('personalSalaryModalContent');
            
            let html = `
                <div class="form-group">
                    <label>员工</label>
                    <input type="text" value="${employeeName}" readonly class="employee-name-display">
                </div>
                
                <div class="form-group">
                    <label>选择月份</label>
                    <div class="personal-salary-selector">
                        <select id="modalPersonalSalaryMonthSelect">
            `;
            
            // 添加月份选项
            const months = [
                '1月', '2月', '3月', '4月', '5月', '6月',
                '7月', '8月', '9月', '10月', '11月', '12月'
            ];
            
            months.forEach((month, index) => {
                const selected = index === currentMonth ? 'selected' : '';
                html += `<option value="${index}" ${selected}>${month}</option>`;
            });
            
            html += `
                        </select>
                        <select id="modalPersonalSalaryYearSelect">
            `;
            
            // 添加年份选项（从2026年开始）
            for (let year = 2026; year <= 2030; year++) {
                const selected = year === currentYear ? 'selected' : '';
                html += `<option value="${year}" ${selected}>${year}年</option>`;
            }
            
            html += `
                        </select>
                        <button class="btn btn-primary" id="loadModalPersonalSalary">加载</button>
                    </div>
                </div>
                
                <div id="modalPersonalSalaryGridContainer">
                    <!-- 个人工资设置网格将通过JavaScript动态生成 -->
                </div>
            `;
            
            modalContent.innerHTML = html;
            
            // 设置事件监听器
            document.getElementById('loadModalPersonalSalary').addEventListener('click', function() {
                loadModalPersonalSalaryGrid(employeeName);
            });
            
            // 显示模态框
            document.getElementById('personalSalaryModal').classList.add('active');
            
            // 加载默认月份的个人工资设置
            loadModalPersonalSalaryGrid(employeeName);
        }
        
        // 加载模态框中的个人工资设置网格
        function loadModalPersonalSalaryGrid(employeeName) {
            const container = document.getElementById('modalPersonalSalaryGridContainer');
            
            // 获取选中的月份和年份
            const monthSelect = document.getElementById('modalPersonalSalaryMonthSelect');
            const yearSelect = document.getElementById('modalPersonalSalaryYearSelect');
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
            const today = new Date();
            today.setFullYear(2026); // 设置为2026年
            const isCurrentMonth = today.getMonth() === selectedMonth && today.getFullYear() === selectedYear;
            
            let html = `
                <h3>${selectedYear}年${selectedMonth + 1}月 ${employeeName}的个人工资设置</h3>
                <div class="personal-batch-settings">
                    <div class="batch-setting-group">
                        <label>统一设置工资：</label>
                        <input type="number" id="modalUniformSalary" min="0" step="1" placeholder="如：180">
                    </div>
                    <div class="quick-actions">
                        <button class="quick-action-btn" id="applyModalUniform">应用统一设置</button>
                        <button class="quick-action-btn" id="clearModalSalaries">清除个人设置</button>
                        <button class="quick-action-btn" id="copyModalFromGlobal">复制全局设置</button>
                    </div>
                </div>
                
                <div class="personal-salary-grid" style="max-height: 300px;">
            `;
            
            // 生成每天单元格
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(selectedYear, selectedMonth, day);
                const dayOfWeek = getDayOfWeek(selectedYear, selectedMonth, day);
                const isWeekendDay = isWeekend(selectedYear, selectedMonth, day);
                const isToday = isCurrentMonth && day === today.getDate();
                
                // 获取全局工资
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 获取个人工资
                const personalSalary = hasPersonalSalary(employeeName, dateString) ? 
                    personalSalaries[employeeName][dateString] : '';
                
                // 星期几名称
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                const dayName = dayNames[dayOfWeek];
                
                // 确定CSS类
                let cellClass = 'personal-day-cell';
                if (isWeekendDay) cellClass += ' weekend';
                if (isToday) cellClass += ' today';
                if (personalSalary !== '') cellClass += ' has-custom';
                
                // 工资信息显示
                let salaryInfo = '';
                if (personalSalary !== '') {
                    salaryInfo = `<div class="personal-salary-info personal-salary-custom">个人: ${personalSalary}元</div>`;
                } else {
                    salaryInfo = `<div class="personal-salary-info personal-salary-global">全局: ${globalSalary}元</div>`;
                }
                
                html += `
                <div class="${cellClass}" data-date="${dateString}">
                    <div class="personal-day-number">${day}日</div>
                    <div class="day-name">${dayName}</div>
                    <input type="number" 
                           class="personal-day-salary-input" 
                           value="${personalSalary}" 
                           min="0" 
                           step="1"
                           placeholder="${globalSalary}"
                           data-date="${dateString}"
                           data-employee="${employeeName}">
                    ${salaryInfo}
                </div>
                `;
            }
            
            html += `</div>`;
            container.innerHTML = html;
            
            // 设置事件监听器
            document.getElementById('applyModalUniform').addEventListener('click', function() {
                applyModalUniformSalary(employeeName, selectedYear, selectedMonth, daysInMonth);
            });
            
            document.getElementById('clearModalSalaries').addEventListener('click', function() {
                clearModalPersonalSalaries(employeeName, selectedYear, selectedMonth, daysInMonth);
            });
            
            document.getElementById('copyModalFromGlobal').addEventListener('click', function() {
                copyModalFromGlobal(employeeName, selectedYear, selectedMonth, daysInMonth);
            });
            
            // 设置输入框变化事件
            container.querySelectorAll('.personal-day-salary-input').forEach(input => {
                input.addEventListener('change', function() {
                    const dateString = this.getAttribute('data-date');
                    const employeeName = this.getAttribute('data-employee');
                    const salary = this.value;
                    
                    updatePersonalSalary(employeeName, dateString, salary);
                    
                    // 更新单元格显示
                    const cell = this.closest('.personal-day-cell');
                    const globalSalary = dailySalaries[dateString] || 0;
                    
                    if (salary === '' || salary === null || salary === undefined) {
                        cell.classList.remove('has-custom');
                        // 更新工资信息显示
                        const infoElement = cell.querySelector('.personal-salary-info');
                        if (infoElement) {
                            infoElement.className = 'personal-salary-info personal-salary-global';
                            infoElement.textContent = `全局: ${globalSalary}元`;
                        }
                    } else {
                        cell.classList.add('has-custom');
                        // 更新工资信息显示
                        const infoElement = cell.querySelector('.personal-salary-info');
                        if (infoElement) {
                            infoElement.className = 'personal-salary-info personal-salary-custom';
                            infoElement.textContent = `个人: ${salary}元`;
                        }
                    }
                });
            });
        }
        
        // 应用模态框中的统一个人工资设置
        function applyModalUniformSalary(employeeName, year, month, daysInMonth) {
            // 获取统一工资值
            const uniformSalary = parseInt(document.getElementById('modalUniformSalary').value) || 0;
            
            if (uniformSalary <= 0) {
                showNotification('warning', '设置失败', '请输入有效的工资数值');
                return;
            }
            
            // 初始化员工个人工资对象
            if (!personalSalaries[employeeName]) {
                personalSalaries[employeeName] = {};
            }
            
            // 设置每天的工资
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(year, month, day);
                personalSalaries[employeeName][dateString] = uniformSalary;
                
                // 清除导出记录（因为数据已更改）
                delete exportRecords[`${dateString}_personal`];
            }
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 重新加载网格
            loadModalPersonalSalaryGrid(employeeName);
            
            // 显示通知
            showNotification('success', '个人工资设置成功', `${employeeName}在${year}年${month + 1}月的个人工资已统一设置为${uniformSalary}元`);
        }
        
        // 清除模态框中的个人工资设置
        function clearModalPersonalSalaries(employeeName, year, month, daysInMonth) {
            // 清除每天的工资设置
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(year, month, day);
                if (personalSalaries[employeeName] && personalSalaries[employeeName][dateString] !== undefined) {
                    delete personalSalaries[employeeName][dateString];
                    
                    // 清除导出记录
                    delete exportRecords[`${dateString}_personal`];
                }
            }
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 重新加载网格
            loadModalPersonalSalaryGrid(employeeName);
            
            // 显示通知
            showNotification('success', '个人工资已清除', `${employeeName}在${year}年${month + 1}月的个人工资设置已清除`);
        }
        
        // 复制全局设置到模态框中的个人工资
        function copyModalFromGlobal(employeeName, year, month, daysInMonth) {
            // 初始化员工个人工资对象
            if (!personalSalaries[employeeName]) {
                personalSalaries[employeeName] = {};
            }
            
            // 复制每天的工资设置
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(year, month, day);
                const globalSalary = dailySalaries[dateString] || 0;
                
                if (globalSalary > 0) {
                    personalSalaries[employeeName][dateString] = globalSalary;
                    
                    // 清除导出记录（因为数据已更改）
                    delete exportRecords[`${dateString}_personal`];
                }
            }
            
            // 保存到本地存储
            savePersonalSalaries();
            saveExportRecords();
            
            // 重新加载网格
            loadModalPersonalSalaryGrid(employeeName);
            
            // 显示通知
            showNotification('success', '复制成功', `已将全局工资设置复制到${employeeName}的个人工资设置`);
        }
        
        // 更新系统信息
        function updateSystemInfo() {
            // 更新当前月份显示
            document.getElementById('currentMonthData').textContent = `${currentYear}年${currentMonth + 1}月`;
            
            // 更新员工数量
            const activeEmployees = employees.filter(e => e.active).length;
            document.getElementById('systemEmployeeCount').textContent = activeEmployees;
            
            // 计算数据大小
            const data = JSON.stringify({
                dailySalaries,
                attendanceRecords,
                employees,
                personalSalaries,
                exportRecords
            });
            const dataSize = new Blob([data]).size;
            document.getElementById('dataSize').textContent = (dataSize / 1024).toFixed(2) + ' KB';
            
            // 获取最后保存时间
            const lastSave = localStorage.getItem('lastSaveTime');
            if (lastSave) {
                const lastSaveDate = new Date(lastSave);
                document.getElementById('lastSave').textContent = lastSaveDate.toLocaleString('zh-CN');
            } else {
                document.getElementById('lastSave').textContent = '暂无';
            }
            
            // 更新未导出数据数量
            const unexportedCount = getUnexportedDataCount();
            document.getElementById('unexportedCount').textContent = unexportedCount;
            
            // 更新支付方式显示
            document.getElementById('currentPaymentMethod').textContent = defaultPaymentMethod || '未设置';
        }
        
        // 保存所有数据到本地存储
        function saveAllData() {
            saveDailySalaries();
            saveAttendanceRecords();
            saveEmployees();
            savePersonalSalaries();
            saveExportRecords();
            
            // 保存最后保存时间
            localStorage.setItem('lastSaveTime', new Date().toISOString());
            
            showNotification('success', '保存成功', '所有数据已成功保存到本地存储');
            updateSystemInfo();
        }
        
        // 保存每日工资设置
        function saveDailySalaries() {
            localStorage.setItem('dailySalaries', JSON.stringify(dailySalaries));
        }
        
        // 保存出勤记录
        function saveAttendanceRecords() {
            localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
        }
        
        // 从本地存储加载数据
        function loadData() {
            const savedDailySalaries = localStorage.getItem('dailySalaries');
            const savedAttendanceRecords = localStorage.getItem('attendanceRecords');
            const savedPersonalSalaries = localStorage.getItem('personalSalaries');
            const savedExportRecords = localStorage.getItem('exportRecords');
            
            if (savedDailySalaries) {
                dailySalaries = JSON.parse(savedDailySalaries);
            }
            
            if (savedAttendanceRecords) {
                attendanceRecords = JSON.parse(savedAttendanceRecords);
            }
            
            if (savedPersonalSalaries) {
                personalSalaries = JSON.parse(savedPersonalSalaries);
            }
            
            if (savedExportRecords) {
                exportRecords = JSON.parse(savedExportRecords);
            }
            
            // 加载系统设置
            const defaultWeekdaySalary = localStorage.getItem('defaultWeekdaySalary');
            const defaultWeekendSalary = localStorage.getItem('defaultWeekendSalary');
            const defaultHolidaySalary = localStorage.getItem('defaultHolidaySalary');
            
            if (defaultWeekdaySalary) {
                document.getElementById('defaultWeekdaySalary').value = defaultWeekdaySalary;
            }
            
            if (defaultWeekendSalary) {
                document.getElementById('defaultWeekendSalary').value = defaultWeekendSalary;
            }
            
            if (defaultHolidaySalary) {
                document.getElementById('defaultHolidaySalary').value = defaultHolidaySalary;
            }
            
            // 更新界面
            updateDailySalaryGrid();
            updateDailySalaryPreview();
            updateMonthSalaryStats();
            updateAttendanceCalendar();
            updateAttendanceStats();
            updateAttendanceEmployeeSummary();
            updateSalarySummaryTables();
            updateCalendarView();
            updateCalendarStats();
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            
            showNotification('success', '加载成功', '数据已从本地存储加载');
            updateSystemInfo();
        }
        
        // 预览导出数据
        function previewExportData() {
            // 获取日期范围
            const startDate = document.getElementById('exportStartDate').value;
            const endDate = document.getElementById('exportEndDate').value;
            
            if (!startDate || !endDate) {
                showNotification('error', '预览失败', '请选择开始日期和结束日期');
                return;
            }
            
            if (new Date(startDate) > new Date(endDate)) {
                showNotification('error', '预览失败', '开始日期不能晚于结束日期');
                return;
            }
            
            // 获取选中的员工
            const selectedEmployees = getSelectedExportEmployees();
            
            // 获取支付方式
            const paymentMethod = document.getElementById('exportPaymentMethod').value || defaultPaymentMethod;
            
            // 根据导出类型预览数据
            if (currentExportType === 'salary') {
                previewSalaryData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'attendance') {
                previewAttendanceData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'personal') {
                previewPersonalSalaryData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'calculation') {
                previewCalculationData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'payroll') {
                previewPayrollData(startDate, endDate, selectedEmployees, paymentMethod);
            }
        }
        
        // 预览工资数据
        function previewSalaryData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            const previewContent = document.getElementById('exportPreviewContent');
            const previewContainer = document.getElementById('exportPreviewContainer');
            const previewCount = document.getElementById('exportPreviewCount');
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let dataCount = 0;
            let totalSalary = 0;
            let daysWithSalary = 0;
            
            let html = `
                <div class="export-header-info">
                    <h4>📋 工资数据预览</h4>
                    <p><strong>支付工资日期范围：</strong>${startDate} 至 ${endDate}</p>
                    <p><strong>支付方式：</strong>${paymentMethod || "未指定"}</p>
                </div>
                
                <div class="data-preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>日期</th>
                                <th>工资标准(元)</th>
                                <th>导出状态</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const salary = dailySalaries[dateString] || 0;
                
                if (salary > 0) {
                    dataCount++;
                    totalSalary += salary;
                    daysWithSalary++;
                }
                
                const exported = isDataExported(dateString, 'salary');
                
                html += `
                <tr>
                    <td>${dateString}</td>
                    <td>${salary}</td>
                    <td>${salary > 0 ? (exported ? '已导出' : '未导出') : '无数据'}</td>
                </tr>
                `;
            }
            
            html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="export-summary-stats">
                    <h4>📊 导出数据统计</h4>
                    <div class="summary-stats-row">
                        <span>数据记录数量：</span>
                        <span>${dataCount}条</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>工资总额：</span>
                        <span>${totalSalary}元</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>有工资设置的天数：</span>
                        <span>${daysWithSalary}天</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>日期范围：</span>
                        <span>${startDate} 至 ${endDate}（共${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天）</span>
                    </div>
                </div>
            `;
            
            previewContent.innerHTML = html;
            previewCount.textContent = `${dataCount}条记录`;
            previewContainer.style.display = 'block';
            
            // 显示导出按钮
            document.getElementById('exportRangeDataBtn').style.display = 'block';
            document.getElementById('previewExportDataBtn').style.display = 'none';
        }
        
        // 预览出勤数据
        function previewAttendanceData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            const previewContent = document.getElementById('exportPreviewContent');
            const previewContainer = document.getElementById('exportPreviewContainer');
            const previewCount = document.getElementById('exportPreviewCount');
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let dataCount = 0;
            let totalAttendanceDays = 0;
            let totalEmployees = 0;
            
            let html = `
                <div class="export-header-info">
                    <h4>📋 出勤数据预览</h4>
                    <p><strong>支付工资日期范围：</strong>${startDate} 至 ${endDate}</p>
                    <p><strong>支付方式：</strong>${paymentMethod || "未指定"}</p>
                    <p><strong>筛选员工：</strong>${selectedEmployees.length > 0 ? selectedEmployees.join(', ') : "全部员工"}</p>
                </div>
                
                <div class="data-preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>日期</th>
                                <th>员工</th>
                                <th>出勤状态</th>
                                <th>导出状态</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                
                if (attendanceRecords[dateString]) {
                    const exported = isDataExported(dateString, 'attendance');
                    
                    // 筛选员工
                    for (const employee in attendanceRecords[dateString]) {
                        if (selectedEmployees.length === 0 || selectedEmployees.includes(employee)) {
                            dataCount++;
                            totalEmployees++;
                            html += `
                            <tr>
                                <td>${dateString}</td>
                                <td>${employee}</td>
                                <td>出勤</td>
                                <td>${exported ? '已导出' : '未导出'}</td>
                            </tr>
                            `;
                        }
                    }
                    totalAttendanceDays++;
                }
            }
            
            html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="export-summary-stats">
                    <h4>📊 导出数据统计</h4>
                    <div class="summary-stats-row">
                        <span>出勤记录数量：</span>
                        <span>${dataCount}条</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>有出勤记录的天数：</span>
                        <span>${totalAttendanceDays}天</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>出勤员工人次：</span>
                        <span>${totalEmployees}人次</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>日期范围：</span>
                        <span>${startDate} 至 ${endDate}（共${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天）</span>
                    </div>
                </div>
            `;
            
            previewContent.innerHTML = html;
            previewCount.textContent = `${dataCount}条记录`;
            previewContainer.style.display = 'block';
            
            // 显示导出按钮
            document.getElementById('exportRangeDataBtn').style.display = 'block';
            document.getElementById('previewExportDataBtn').style.display = 'none';
        }
        
        // 预览个人工资数据
        function previewPersonalSalaryData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            const previewContent = document.getElementById('exportPreviewContent');
            const previewContainer = document.getElementById('exportPreviewContainer');
            const previewCount = document.getElementById('exportPreviewCount');
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let dataCount = 0;
            let totalPersonalSalary = 0;
            let totalEmployeesWithPersonal = 0;
            
            let html = `
                <div class="export-header-info">
                    <h4>📋 个人工资数据预览</h4>
                    <p><strong>支付工资日期范围：</strong>${startDate} 至 ${endDate}</p>
                    <p><strong>支付方式：</strong>${paymentMethod || "未指定"}</p>
                    <p><strong>筛选员工：</strong>${selectedEmployees.length > 0 ? selectedEmployees.join(', ') : "全部员工"}</p>
                </div>
                
                <div class="data-preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>员工</th>
                                <th>日期</th>
                                <th>个人工资(元)</th>
                                <th>全局工资(元)</th>
                                <th>导出状态</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 检查是否有个人工资数据
                for (const employee in personalSalaries) {
                    // 筛选员工
                    if (selectedEmployees.length === 0 || selectedEmployees.includes(employee)) {
                        if (personalSalaries[employee][dateString] !== undefined) {
                            dataCount++;
                            const personalSalary = personalSalaries[employee][dateString];
                            totalPersonalSalary += personalSalary;
                            totalEmployeesWithPersonal++;
                            const exported = isDataExported(dateString, 'personal');
                            
                            html += `
                            <tr>
                                <td>${employee}</td>
                                <td>${dateString}</td>
                                <td>${personalSalary}</td>
                                <td>${globalSalary}</td>
                                <td>${exported ? '已导出' : '未导出'}</td>
                            </tr>
                            `;
                        }
                    }
                }
            }
            
            // 如果没有数据，添加提示行
            if (dataCount === 0) {
                html += `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px; color: #7f8c8d;">
                        在${startDate}至${endDate}日期范围内没有个人工资数据
                    </td>
                </tr>
                `;
            }
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            // 如果有数据，添加统计信息
            if (dataCount > 0) {
                html += `
                <div class="export-summary-stats">
                    <h4>📊 导出数据统计</h4>
                    <div class="summary-stats-row">
                        <span>个人工资记录数量：</span>
                        <span>${dataCount}条</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>个人工资总额：</span>
                        <span>${totalPersonalSalary}元</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>使用个人工资的员工人次：</span>
                        <span>${totalEmployeesWithPersonal}人次</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>日期范围：</span>
                        <span>${startDate} 至 ${endDate}（共${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天）</span>
                    </div>
                </div>
                `;
            }
            
            previewContent.innerHTML = html;
            previewCount.textContent = `${dataCount}条记录`;
            previewContainer.style.display = 'block';
            
            // 显示导出按钮
            document.getElementById('exportRangeDataBtn').style.display = 'block';
            document.getElementById('previewExportDataBtn').style.display = 'none';
        }
        
        // 预览工资计算数据
        function previewCalculationData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            const previewContent = document.getElementById('exportPreviewContent');
            const previewContainer = document.getElementById('exportPreviewContainer');
            const previewCount = document.getElementById('exportPreviewCount');
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let dataCount = 0;
            let totalSalary = 0;
            
            // 筛选员工
            const filteredEmployees = employees.filter(employee => 
                employee.active && (selectedEmployees.length === 0 || selectedEmployees.includes(employee.name))
            );
            
            let html = `
                <div class="export-header-info">
                    <h4>📋 工资计算表预览</h4>
                    <p><strong>支付工资日期范围：</strong>${startDate} 至 ${endDate}</p>
                    <p><strong>支付方式：</strong>${paymentMethod || "未指定"}</p>
                    <p><strong>员工：</strong>${filteredEmployees.length}人</p>
                </div>
                <div class="data-preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>员工</th>
            `;
            
            // 添加日期列
            const dateRange = [];
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const day = date.getDate();
                const month = date.getMonth() + 1;
                html += `<th>${month}/${day}</th>`;
                dateRange.push(dateString);
            }
            html += `<th>总计</th></tr></thead><tbody>`;
            
            // 为每个员工添加行
            filteredEmployees.forEach(employee => {
                const employeeName = employee.name;
                html += `<tr><td>${employeeName}</td>`;
                let rowTotal = 0;
                
                dateRange.forEach(dateString => {
                    // 检查员工是否出勤
                    const isPresent = attendanceRecords[dateString] && attendanceRecords[dateString][employee.name];
                    
                    // 获取员工该日的工资
                    const salary = isPresent ? getEmployeeSalary(employee.name, dateString) : 0;
                    
                    rowTotal += salary;
                    html += `<td>${salary > 0 ? salary : ''}</td>`;
                    if (salary > 0) dataCount++;
                });
                
                totalSalary += rowTotal;
                html += `<td>${rowTotal}</td></tr>`;
            });
            
            // 添加总计行
            html += `<tr><td><strong>每日总计</strong></td>`;
            
            let grandTotal = 0;
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const globalSalary = dailySalaries[dateString] || 0;
                const attendanceEmployees = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]) : [];
                
                // 计算当日总工资（考虑个人工资设置）
                let dailyTotal = 0;
                attendanceEmployees.forEach(employeeName => {
                    const employeeSalary = getEmployeeSalary(employeeName, dateString);
                    dailyTotal += employeeSalary;
                });
                
                grandTotal += dailyTotal;
                
                html += `<td>${dailyTotal}</td>`;
            }
            
            html += `<td><strong>${grandTotal}</strong></td></tr>`;
            html += `</tbody></table></div>`;
            
            // 添加统计信息
            html += `
                <div class="export-summary-stats">
                    <h4>📊 工资计算统计</h4>
                    <div class="summary-stats-row">
                        <span>工资记录数量：</span>
                        <span>${dataCount}条</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>工资总额：</span>
                        <span>${totalSalary}元</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>员工数量：</span>
                        <span>${filteredEmployees.length}人</span>
                    </div>
                    <div class="summary-stats-row">
                        <span>日期范围：</span>
                        <span>${startDate} 至 ${endDate}（共${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天）</span>
                    </div>
                </div>
            `;
            
            previewContent.innerHTML = html;
            previewCount.textContent = `${dataCount}条工资记录`;
            previewContainer.style.display = 'block';
            
            // 显示导出按钮
            document.getElementById('exportRangeDataBtn').style.display = 'block';
            document.getElementById('previewExportDataBtn').style.display = 'none';
        }
        
        // 预览工资发放表
        function previewPayrollData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            const previewContent = document.getElementById('exportPreviewContent');
            const previewContainer = document.getElementById('exportPreviewContainer');
            const previewCount = document.getElementById('exportPreviewCount');
            
            // 筛选员工
            const filteredEmployees = employees.filter(employee => 
                employee.active && (selectedEmployees.length === 0 || selectedEmployees.includes(employee.name))
            );
            
            let html = `
                <div class="export-header-info">
                    <h4>📋 工资发放表预览</h4>
                    <p><strong>支付工资日期范围：</strong>${startDate} 至 ${endDate}</p>
                    <p><strong>支付方式：</strong>${paymentMethod || defaultPaymentMethod || "未指定"}</p>
                    <p><strong>每日工作小时数：</strong>${dailyWorkHours}小时</p>
                    <p><strong>员工数量：</strong>${filteredEmployees.length}人</p>
                </div>
                
                <div class="data-preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>姓名</th>
                                <th>身份证号</th>
                                <th>出勤天数(天)</th>
                                <th>工作时长(小时)</th>
                                <th>应发工资(元)</th>
                                <th>支付方式</th>
                                <th>签名</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            let totalAttendanceDays = 0;
            let totalWorkHours = 0;
            let totalSalary = 0;
            
            // 计算每个员工的工资数据
            filteredEmployees.forEach(employee => {
                const employeeName = employee.name;
                const idCard = employee.idCard || '';
                
                // 计算出勤天数、工作时长和应发工资
                let attendanceDays = 0;
                let employeeSalary = 0;
                
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                    const dateString = date.toISOString().split('T')[0];
                    
                    // 检查员工是否出勤
                    if (attendanceRecords[dateString] && attendanceRecords[dateString][employeeName]) {
                        // 获取员工该日的工资
                        const dailySalary = getEmployeeSalary(employeeName, dateString);
                        
                        if (dailySalary > 0) {
                            attendanceDays++;
                            employeeSalary += dailySalary;
                        }
                    }
                }
                
                // 计算工作时长
                //const workHours = attendanceDays * dailyWorkHours;
                const workHours = "";
                
                // 累计总计
                totalAttendanceDays += attendanceDays;
                totalWorkHours += workHours;
                totalSalary += employeeSalary;
                
                html += `
                <tr>
                    <td>${employeeName}</td>
                    <td>${idCard}</td>
                    <td>${attendanceDays}</td>
                    <td>${workHours}</td>
                    <td>${employeeSalary}</td>
                    <td>${paymentMethod || defaultPaymentMethod || ''}</td>
                    <td></td>
                </tr>
                `;
            });
            
            html += `</tbody></table></div>`;
            
            // 添加总计行
            html += `
                <div class="data-preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>统计项</th>
                                <th>数值</th>
                            </tr>
                        </thead>
                        <tbody>
                          
                           
                            <tr>
                                <td><strong>工资总额</strong></td>
                                <td><strong>${totalSalary}元</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            
            previewContent.innerHTML = html;
            previewCount.textContent = `${filteredEmployees.length}条员工记录`;
            previewContainer.style.display = 'block';
            
            // 显示导出按钮
            document.getElementById('exportRangeDataBtn').style.display = 'block';
            document.getElementById('previewExportDataBtn').style.display = 'none';
        }
        
        // 确认导出
        function confirmExport() {
            exportRangeData();
        }
        
        // 取消导出
        function cancelExport() {
            document.getElementById('exportPreviewContainer').style.display = 'none';
            document.getElementById('exportRangeDataBtn').style.display = 'none';
            document.getElementById('previewExportDataBtn').style.display = 'block';
        }
        
        // 导出数据为CSV
        function exportData() {
            // 获取当前导出类型
            const exportType = currentExportType;
            
            // 获取日期范围
            const startDate = document.getElementById('exportStartDate').value;
            const endDate = document.getElementById('exportEndDate').value;
            
            if (!startDate || !endDate) {
                showNotification('error', '导出失败', '请选择开始日期和结束日期');
                return;
            }
            
            if (new Date(startDate) > new Date(endDate)) {
                showNotification('error', '导出失败', '开始日期不能晚于结束日期');
                return;
            }
            
            // 根据导出类型导出数据
            if (exportType === 'salary') {
                exportSalaryData(startDate, endDate);
            } else if (exportType === 'attendance') {
                exportAttendanceData(startDate, endDate);
            } else if (exportType === 'personal') {
                exportPersonalSalaryData(startDate, endDate);
            } else if (exportType === 'calculation') {
                exportCalculationData(startDate, endDate);
            } else if (exportType === 'payroll') {
                exportPayrollData(startDate, endDate);
            }
        }
        
        // 按日期范围导出数据
        function exportRangeData() {
            // 获取日期范围
            const startDate = document.getElementById('exportStartDate').value;
            const endDate = document.getElementById('exportEndDate').value;
            
            if (!startDate || !endDate) {
                showNotification('error', '导出失败', '请选择开始日期和结束日期');
                return;
            }
            
            if (new Date(startDate) > new Date(endDate)) {
                showNotification('error', '导出失败', '开始日期不能晚于结束日期');
                return;
            }
            
            // 获取选中的员工
            const selectedEmployees = getSelectedExportEmployees();
            
            // 获取支付方式
            const paymentMethod = document.getElementById('exportPaymentMethod').value || defaultPaymentMethod;
            
            // 根据当前导出类型导出数据
            if (currentExportType === 'salary') {
                exportSalaryData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'attendance') {
                exportAttendanceData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'personal') {
                exportPersonalSalaryData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'calculation') {
                exportCalculationData(startDate, endDate, selectedEmployees, paymentMethod);
            } else if (currentExportType === 'payroll') {
                exportPayrollData(startDate, endDate, selectedEmployees, paymentMethod);
            }
            
            // 隐藏预览容器
            document.getElementById('exportPreviewContainer').style.display = 'none';
            document.getElementById('exportRangeDataBtn').style.display = 'none';
            document.getElementById('previewExportDataBtn').style.display = 'block';
        }
        
        // 导出工资数据
        function exportSalaryData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            // 创建工资数据CSV
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
            csvContent += "工资数据导出报表\n";
            csvContent += `支付工资日期范围,${startDate} 至 ${endDate}\n`;
           
            csvContent += `\n`;
            csvContent += "日期,工资标准(元),导出状态\n";
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let exportedCount = 0;
            let totalSalary = 0;
            let daysWithSalary = 0;
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const salary = dailySalaries[dateString] || 0;
                
                if (salary > 0) {
                    // 标记为已导出
                    markDataAsExported(dateString, 'salary');
                    exportedCount++;
                    totalSalary += salary;
                    daysWithSalary++;
                }
                
                csvContent += `${dateString},${salary},${salary > 0 ? "已导出" : "无数据"}\n`;
            }
            
            // 添加统计信息
            csvContent += `\n`;
            csvContent += `统计信息\n`;
            csvContent += `数据记录数量,${exportedCount}条\n`;
            csvContent += `工资总额,${totalSalary}元\n`;
            csvContent += `有工资设置的天数,${daysWithSalary}天\n`;
            csvContent += `日期范围,${startDate} 至 ${endDate}\n`;
            csvContent += `总天数,${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天\n`;
            
            // 创建下载链接
            const exportDate = new Date().toISOString().split('T')[0];
            const fileName = `每日工资标准_${startDate}_至_${endDate}_${exportDate}.csv`;
            
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 更新界面
            updateDailySalaryGrid();
            updateDailySalaryPreview();
            updateUnexportedDataPreview();
            
            showNotification('success', '导出成功', `已导出${exportedCount}条工资数据，文件：${fileName}`);
        }
        
        // 导出出勤数据
        function exportAttendanceData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            // 创建出勤数据CSV
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
            csvContent += "员工出勤数据导出报表\n";
            csvContent += `支付工资日期范围,${startDate} 至 ${endDate}\n`;
            csvContent += `\n`;
            csvContent += "日期,员工,出勤状态,导出状态\n";
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let exportedCount = 0;
            let totalAttendanceDays = 0;
            let totalEmployees = 0;
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                
                if (attendanceRecords[dateString]) {
                    // 标记为已导出
                    markDataAsExported(dateString, 'attendance');
                    exportedCount++;
                    totalAttendanceDays++;
                    
                    // 筛选员工并添加出勤记录
                    for (const employee in attendanceRecords[dateString]) {
                        if (selectedEmployees.length === 0 || selectedEmployees.includes(employee)) {
                            totalEmployees++;
                            csvContent += `${dateString},${employee},出勤,已导出\n`;
                        }
                    }
                } else {
                    csvContent += `${dateString},,无出勤记录,无数据\n`;
                }
            }
            
            // 添加统计信息
            csvContent += `\n`;
            csvContent += `统计信息\n`;
            csvContent += `出勤记录数量,${totalEmployees}条\n`;
            csvContent += `有出勤记录的天数,${totalAttendanceDays}天\n`;
            csvContent += `出勤员工人次,${totalEmployees}人次\n`;
            csvContent += `日期范围,${startDate} 至 ${endDate}\n`;
            csvContent += `总天数,${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天\n`;
            
            // 创建下载链接
            const exportDate = new Date().toISOString().split('T')[0];
            const fileName = `员工出勤记录_${startDate}_至_${endDate}_${exportDate}.csv`;
            
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 更新界面
            updateAttendanceCalendar();
            updateUnexportedDataPreview();
            
            showNotification('success', '导出成功', `已导出${totalEmployees}条出勤数据，文件：${fileName}`);
        }
        
        // 导出个人工资数据
        function exportPersonalSalaryData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            // 创建个人工资数据CSV
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
            csvContent += "员工个人工资设置导出报表\n";
            csvContent += `支付工资日期范围,${startDate} 至 ${endDate}\n`;
       
            csvContent += `\n`;
            csvContent += "员工,日期,个人工资(元),全局工资(元),导出状态\n";
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            let exportedCount = 0;
            let totalPersonalSalary = 0;
            let totalEmployeesWithPersonal = 0;
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const globalSalary = dailySalaries[dateString] || 0;
                
                // 检查是否有个人工资数据
                for (const employee in personalSalaries) {
                    // 筛选员工
                    if (selectedEmployees.length === 0 || selectedEmployees.includes(employee)) {
                        if (personalSalaries[employee][dateString] !== undefined) {
                            const personalSalary = personalSalaries[employee][dateString];
                            
                            // 标记为已导出
                            markDataAsExported(dateString, 'personal');
                            exportedCount++;
                            totalPersonalSalary += personalSalary;
                            totalEmployeesWithPersonal++;
                            
                            csvContent += `${employee},${dateString},${personalSalary},${globalSalary},已导出\n`;
                        }
                    }
                }
            }
            
            // 如果没有数据，添加提示行
            if (exportedCount === 0) {
                csvContent += `无数据,${startDate} 至 ${endDate},,,无个人工资数据\n`;
            } else {
                // 添加统计信息
                csvContent += `\n`;
                csvContent += `统计信息\n`;
                csvContent += `个人工资记录数量,${exportedCount}条\n`;
                csvContent += `个人工资总额,${totalPersonalSalary}元\n`;
                csvContent += `使用个人工资的员工人次,${totalEmployeesWithPersonal}人次\n`;
                csvContent += `日期范围,${startDate} 至 ${endDate}\n`;
                csvContent += `总天数,${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天\n`;
            }
            
            // 创建下载链接
            const exportDate = new Date().toISOString().split('T')[0];
            const fileName = `员工个人工资设置_${startDate}_至_${endDate}_${exportDate}.csv`;
            
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 更新界面
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            updateUnexportedDataPreview();
            
            showNotification('success', '导出成功', `已导出${exportedCount}条个人工资数据，文件：${fileName}`);
        }
        
        // 导出工资计算数据
        function exportCalculationData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            // 创建工资计算CSV
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
            csvContent += "员工工资计算表\n";
            csvContent += `支付工资日期范围,${startDate} 至 ${endDate}\n`;
           
            csvContent += `\n`;
            csvContent += "员工";
            
            // 获取日期范围
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // 添加日期列
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const day = date.getDate();
                const month = date.getMonth() + 1;
                csvContent += `,${month}月${day}日`;
            }
            csvContent += ",总计\n";
            
            let exportedCount = 0;
            let totalSalary = 0;
            
            // 筛选员工
            const filteredEmployees = employees.filter(employee => 
                employee.active && (selectedEmployees.length === 0 || selectedEmployees.includes(employee.name))
            );
            
            // 为每个员工添加行
            filteredEmployees.forEach(employee => {
                const employeeName = employee.name;
                csvContent += `${employeeName}`;
                let rowTotal = 0;
                
                for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                    const dateString = date.toISOString().split('T')[0];
                    
                    // 检查员工是否出勤
                    const isPresent = attendanceRecords[dateString] && attendanceRecords[dateString][employee.name];
                    
                    // 获取员工该日的工资
                    const salary = isPresent ? getEmployeeSalary(employee.name, dateString) : 0;
                    
                    rowTotal += salary;
                    csvContent += `,${salary}`;
                    
                    if (salary > 0) {
                        exportedCount++;
                    }
                }
                
                totalSalary += rowTotal;
                csvContent += `,${rowTotal}\n`;
            });
            
            // 标记所有数据为已导出
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                markDataAsExported(dateString, 'salary');
                markDataAsExported(dateString, 'attendance');
                markDataAsExported(dateString, 'personal');
            }
            
            // 添加总计行
            csvContent += `总计`;
            let grandTotal = 0;
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                const globalSalary = dailySalaries[dateString] || 0;
                const attendanceEmployees = attendanceRecords[dateString] ? 
                    Object.keys(attendanceRecords[dateString]) : [];
                
                // 计算当日总工资
                let dailyTotal = 0;
                attendanceEmployees.forEach(employeeName => {
                    const employeeSalary = getEmployeeSalary(employeeName, dateString);
                    dailyTotal += employeeSalary;
                });
                
                grandTotal += dailyTotal;
                csvContent += `,${dailyTotal}`;
            }
            csvContent += `,${grandTotal}\n`;
            
            // 添加统计信息
            csvContent += `\n`;
            csvContent += `统计信息\n`;
            csvContent += `工资记录数量,${exportedCount}条\n`;
            csvContent += `工资总额,${totalSalary}元\n`;
            csvContent += `员工数量,${filteredEmployees.length}人\n`;
            csvContent += `日期范围,${startDate} 至 ${endDate}\n`;
            csvContent += `总天数,${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1}天\n`;
            
            // 创建下载链接
            const exportDate = new Date().toISOString().split('T')[0];
            const fileName = `员工工资计算表_${startDate}_至_${endDate}_${exportDate}.csv`;
            
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 更新界面
            updateDailySalaryGrid();
            updateDailySalaryPreview();
            updateAttendanceCalendar();
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            updateUnexportedDataPreview();
            
            showNotification('success', '导出成功', `已导出工资计算数据，文件：${fileName}`);
        }
        
        // 导出工资发放表
        function exportPayrollData(startDate, endDate, selectedEmployees = [], paymentMethod = '') {
            // 创建工资发放表CSV
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
            csvContent += "员工工资发放表\n";
            csvContent += `支付工资日期范围,${startDate} 至 ${endDate}\n`;
           
            csvContent += `\n`;
            csvContent += "姓名,身份证号,出勤天数(天),工作时长(小时),应发工资(元),支付方式,签名\n";
            
            // 获取日期范围内的数据
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // 筛选员工
            const filteredEmployees = employees.filter(employee => 
                employee.active && (selectedEmployees.length === 0 || selectedEmployees.includes(employee.name))
            );
            
            let totalAttendanceDays = 0;
            let totalWorkHours = 0;
            let totalSalary = 0;
            
            // 计算每个员工的工资数据
            filteredEmployees.forEach(employee => {
                const employeeName = employee.name;
                const idCard = employee.idCard || '';
                
                // 计算出勤天数、工作时长和应发工资
                let attendanceDays = 0;
                let employeeSalary = 0;
                
                for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                    const dateString = date.toISOString().split('T')[0];
                    
                    // 检查员工是否出勤
                    if (attendanceRecords[dateString] && attendanceRecords[dateString][employeeName]) {
                        // 获取员工该日的工资
                        const dailySalary = getEmployeeSalary(employeeName, dateString);
                        
                        if (dailySalary > 0) {
                            attendanceDays++;
                            employeeSalary += dailySalary;
                        }
                    }
                }
                
                // 计算工作时长
                //const workHours = attendanceDays * dailyWorkHours;
                const workHours = "";
                // 累计总计
                totalAttendanceDays += attendanceDays;
                totalWorkHours += workHours;
                totalSalary += employeeSalary;
                
                // 添加员工行到CSV
                const employeePaymentMethod = paymentMethod || defaultPaymentMethod || '';
                csvContent += `${employeeName},${idCard},${attendanceDays},${workHours},${employeeSalary},${employeePaymentMethod},\n`;
            });
            
            // 标记相关数据为已导出
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateString = date.toISOString().split('T')[0];
                markDataAsExported(dateString, 'payroll');
            }
            
            // 添加总计行
            csvContent += `\n`;
            csvContent += `统计信息\n`;
            csvContent += `员工总数,${filteredEmployees.length}人\n`;
            csvContent += `总出勤天数,${totalAttendanceDays}天\n`;
           
            csvContent += `工资总额,${totalSalary}元\n`;
           
            
            // 创建下载链接
            const exportDate = new Date().toISOString().split('T')[0];
            const fileName = `员工工资发放表_${startDate}_至_${endDate}_${exportDate}.csv`;
            
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('success', '导出成功', `工资发放表已导出，文件：${fileName}`);
        }
        
        // 更新未导出数据预览
        function updateUnexportedDataPreview() {
            const container = document.getElementById('unexportedDataPreview');
            
            // 根据当前导出类型显示相应数据
            let html = '';
            
            if (currentExportType === 'salary') {
                html = '<h3>未导出的工资数据</h3>';
                
                // 获取未导出的工资数据
                const unexportedSalary = [];
                for (const date in dailySalaries) {
                    if (dailySalaries[date] > 0 && !isDataExported(date, 'salary')) {
                        unexportedSalary.push({
                            date: date,
                            salary: dailySalaries[date]
                        });
                    }
                }
                
                if (unexportedSalary.length === 0) {
                    html += '<div class="export-status exported">所有工资数据已导出</div>';
                } else {
                    html += `<div class="export-status unexported">有${unexportedSalary.length}天工资数据未导出</div>`;
                    
                    // 显示预览表格
                    html += '<div class="data-preview-container">';
                    html += '<table class="preview-table"><thead><tr><th>日期</th><th>工资(元)</th></tr></thead><tbody>';
                    
                    unexportedSalary.slice(0, 10).forEach(item => {
                        const formattedDate = new Date(item.date).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        });
                        html += `<tr><td>${formattedDate}</td><td>${item.salary}</td></tr>`;
                    });
                    
                    if (unexportedSalary.length > 10) {
                        html += `<tr><td colspan="2">... 还有${unexportedSalary.length - 10}条记录</td></tr>`;
                    }
                    
                    html += '</tbody></table></div>';
                }
                
            } else if (currentExportType === 'attendance') {
                html = '<h3>未导出的出勤数据</h3>';
                
                // 获取未导出的出勤数据
                const unexportedAttendance = [];
                for (const date in attendanceRecords) {
                    if (Object.keys(attendanceRecords[date]).length > 0 && !isDataExported(date, 'attendance')) {
                        unexportedAttendance.push({
                            date: date,
                            count: Object.keys(attendanceRecords[date]).length
                        });
                    }
                }
                
                if (unexportedAttendance.length === 0) {
                    html += '<div class="export-status exported">所有出勤数据已导出</div>';
                } else {
                    html += `<div class="export-status unexported">有${unexportedAttendance.length}天出勤数据未导出</div>`;
                    
                    // 显示预览表格
                    html += '<div class="data-preview-container">';
                    html += '<table class="preview-table"><thead><tr><th>日期</th><th>出勤人数</th></tr></thead><tbody>';
                    
                    unexportedAttendance.slice(0, 10).forEach(item => {
                        const formattedDate = new Date(item.date).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        });
                        html += `<tr><td>${formattedDate}</td><td>${item.count}人</td></tr>`;
                    });
                    
                    if (unexportedAttendance.length > 10) {
                        html += `<tr><td colspan="2">... 还有${unexportedAttendance.length - 10}条记录</td></tr>`;
                    }
                    
                    html += '</tbody></table></div>';
                }
                
            } else if (currentExportType === 'personal') {
                html = '<h3>未导出的个人工资数据</h3>';
                
                // 获取未导出的个人工资数据
                const unexportedPersonal = [];
                for (const employee in personalSalaries) {
                    for (const date in personalSalaries[employee]) {
                        if (personalSalaries[employee][date] > 0 && !isDataExported(date, 'personal')) {
                            unexportedPersonal.push({
                                employee: employee,
                                date: date,
                                salary: personalSalaries[employee][date]
                            });
                        }
                    }
                }
                
                if (unexportedPersonal.length === 0) {
                    html += '<div class="export-status exported">所有个人工资数据已导出</div>';
                } else {
                    html += `<div class="export-status unexported">有${unexportedPersonal.length}条个人工资数据未导出</div>`;
                    
                    // 显示预览表格
                    html += '<div class="data-preview-container">';
                    html += '<table class="preview-table"><thead><tr><th>员工</th><th>日期</th><th>工资(元)</th></tr></thead><tbody>';
                    
                    unexportedPersonal.slice(0, 10).forEach(item => {
                        const formattedDate = new Date(item.date).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        });
                        html += `<tr><td>${item.employee}</td><td>${formattedDate}</td><td>${item.salary}</td></tr>`;
                    });
                    
                    if (unexportedPersonal.length > 10) {
                        html += `<tr><td colspan="3">... 还有${unexportedPersonal.length - 10}条记录</td></tr>`;
                    }
                    
                    html += '</tbody></table></div>';
                }
            } else if (currentExportType === 'payroll') {
                html = '<h3>工资发放表导出</h3>';
                html += '<div class="export-status info">工资发放表包含以下列：姓名、身份证号、出勤天数、工作时长、应发工资、支付方式、签名</div>';
                html += `<p style="margin-top: 10px;">每日工作小时数：${dailyWorkHours}小时（可在左侧修改）</p>`;
                html += `<p>默认支付方式：${defaultPaymentMethod || '未设置'}（可在左侧设置）</p>`;
            }
            
            container.innerHTML = html;
        }
        
        // 导入CSV数据
        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const contents = e.target.result;
                const lines = contents.split('\n');
                
                // 检查文件类型
                if (lines[0].includes('日期,工资标准')) {
                    // 导入工资数据
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const columns = line.split(',').map(col => col.replace(/"/g, ''));
                        if (columns.length >= 2) {
                            const date = columns[0];
                            const salary = parseFloat(columns[1]) || 0;
                            dailySalaries[date] = salary;
                        }
                    }
                    saveDailySalaries();
                    showNotification('success', '导入成功', '工资数据已导入');
                    
                } else if (lines[0].includes('日期,员工,出勤')) {
                    // 导入出勤数据
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const columns = line.split(',').map(col => col.replace(/"/g, ''));
                        if (columns.length >= 3) {
                            const date = columns[0];
                            const employee = columns[1];
                            const attendance = columns[2];
                            
                            if (!attendanceRecords[date]) {
                                attendanceRecords[date] = {};
                            }
                            
                            if (attendance === '是' || attendance === '1' || attendance === 'true' || attendance === '出勤') {
                                attendanceRecords[date][employee] = true;
                            }
                        }
                    }
                    saveAttendanceRecords();
                    showNotification('success', '导入成功', '出勤数据已导入');
                    
                } else if (lines[0].includes('员工,日期,个人工资')) {
                    // 导入个人工资数据
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const columns = line.split(',').map(col => col.replace(/"/g, ''));
                        if (columns.length >= 3) {
                            const employee = columns[0];
                            const date = columns[1];
                            const salary = parseFloat(columns[2]) || 0;
                            
                            if (!personalSalaries[employee]) {
                                personalSalaries[employee] = {};
                            }
                            
                            personalSalaries[employee][date] = salary;
                        }
                    }
                    savePersonalSalaries();
                    showNotification('success', '导入成功', '个人工资数据已导入');
                }
                
                // 更新界面
                updateDailySalaryGrid();
                updateDailySalaryPreview();
                updateMonthSalaryStats();
                updateAttendanceCalendar();
                updateAttendanceStats();
                updateAttendanceEmployeeSummary();
                updateSalarySummaryTables();
                updateCalendarView();
                updateCalendarStats();
                updatePersonalSalaryGrid();
                updatePersonalSalaryPreview();
                updateUnexportedDataPreview();
                
                // 清空文件输入
                event.target.value = '';
            };
            
            reader.readAsText(file, 'UTF-8');
        }
        
        // 重置本月数据
        function resetCurrentMonthData() {
            // 获取该月的天数
            const daysInMonth = getDaysInMonth(currentYear, currentMonth);
            
            // 删除该月的每日工资设置
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                delete dailySalaries[dateString];
                delete exportRecords[`${dateString}_salary`];
            }
            
            // 删除该月的出勤记录
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(currentYear, currentMonth, day);
                delete attendanceRecords[dateString];
                delete exportRecords[`${dateString}_attendance`];
            }
            
            // 删除该月的个人工资设置
            employees.forEach(employee => {
                if (personalSalaries[employee.name]) {
                    for (let day = 1; day <= daysInMonth; day++) {
                        const dateString = formatDate(currentYear, currentMonth, day);
                        delete personalSalaries[employee.name][dateString];
                        delete exportRecords[`${dateString}_personal`];
                    }
                }
            });
            
            // 保存到本地存储
            saveDailySalaries();
            saveAttendanceRecords();
            savePersonalSalaries();
            saveExportRecords();
            
            // 更新界面
            updateDailySalaryGrid();
            updateDailySalaryPreview();
            updateMonthSalaryStats();
            updateAttendanceCalendar();
            updateAttendanceStats();
            updateAttendanceEmployeeSummary();
            updateSalarySummaryTables();
            updateCalendarView();
            updateCalendarStats();
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            updateUnexportedDataPreview();
            
            showNotification('success', '重置成功', `${currentYear}年${currentMonth + 1}月的数据已重置`);
        }
        
        // 重置所有数据
        function resetAllData() {
            dailySalaries = {};
            attendanceRecords = {};
            personalSalaries = {};
            exportRecords = {};
            
            // 重新初始化个人工资数据
            employees.forEach(employee => {
                personalSalaries[employee.name] = {};
            });
            
            // 保存到本地存储
            saveDailySalaries();
            saveAttendanceRecords();
            savePersonalSalaries();
            saveExportRecords();
            
            // 更新界面
            updateDailySalaryGrid();
            updateDailySalaryPreview();
            updateMonthSalaryStats();
            updateAttendanceCalendar();
            updateAttendanceStats();
            updateAttendanceEmployeeSummary();
            updateSalarySummaryTables();
            updateCalendarView();
            updateCalendarStats();
            updatePersonalSalaryGrid();
            updatePersonalSalaryPreview();
            updateUnexportedDataPreview();
            
            showNotification('success', '清除成功', '所有数据已清除');
        }
        
        // 保存系统设置
        function saveSystemSettings() {
            const defaultWeekdaySalary = document.getElementById('defaultWeekdaySalary').value;
            const defaultWeekendSalary = document.getElementById('defaultWeekendSalary').value;
            const defaultHolidaySalary = document.getElementById('defaultHolidaySalary').value;
            
            localStorage.setItem('defaultWeekdaySalary', defaultWeekdaySalary);
            localStorage.setItem('defaultWeekendSalary', defaultWeekendSalary);
            localStorage.setItem('defaultHolidaySalary', defaultHolidaySalary);
            
            showNotification('success', '设置已保存', '系统设置已保存');
        }
        
        // 显示通知
        function showNotification(type, title, message) {
            // 移除现有通知
            const existingNotification = document.querySelector('.notification');
            if (existingNotification) {
                existingNotification.remove();
            }
            
            // 创建通知元素
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            // 设置图标
            let icon = 'ℹ️';
            if (type === 'success') icon = '✅';
            else if (type === 'error') icon = '❌';
            else if (type === 'warning') icon = '⚠️';
            else if (type === 'info') icon = 'ℹ️';
            
            notification.innerHTML = `
                <div class="notification-header">
                    <div class="notification-title">
                        <span>${icon}</span>
                        ${title}
                    </div>
                    <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div>${message}</div>
            `;
            
            document.body.appendChild(notification);
            
            // 5秒后自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }
        
        // 获取随机颜色
        function getRandomColor() {
            const colors = [
                '#4b6cb7', '#3498db', '#2ecc71', '#f39c12',
                '#9b59b6', '#1abc9c', '#e74c3c', '#34495e',
                '#d35400', '#7f8c8d'
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        }
