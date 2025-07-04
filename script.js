// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// Основные настройки приложения
const CONFIG = {
    apiUrl: window.location.origin, // Базовый URL для API
    userId: null, // Будет установлен после обработки данных
    userName: null, // Будет установлен после обработки данных
    isDev: false // Всегда отключен в боевом режиме
};

// Подписки и их цены - оплата за скрипты
const PLANS = [
    { 
        id: 'single', 
        name: '1 скрипт', 
        price: 49, 
        description: 'Создание одного скрипта оптимизации',
        generations: 1,
        duration: 30,
        popular: false
    },
    { 
        id: 'triple', 
        name: '3 скрипта', 
        price: 129, 
        description: '3 скрипта оптимизации + экономия 15%',
        generations: 3,
        duration: 30,
        popular: true
    },
    { 
        id: 'pack', 
        name: '10 скриптов', 
        price: 399, 
        description: '10 скриптов + максимальная экономия 20%',
        generations: 10,
        duration: 30,
        popular: false
    }
];

// Глобальные переменные для отслеживания платежа
let currentOrderId = null;
let paymentCheckActive = false;

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Открываем Telegram WebApp (сообщаем что приложение готово)
    tg.expand();
    tg.ready();

    // Получаем данные пользователя
    initUserData();

    // Инициализируем интерфейс
    initUI();
    initEventListeners();
    
    // Проверяем параметры URL для определения статуса платежа
    checkUrlForPaymentStatus();

    console.log('Telegram WebApp initialized', CONFIG.userId);
});

// Инициализация данных пользователя
function initUserData() {
    // Проверяем startapp параметр для получения user_id от бота
    // Формат параметра: user_id_123456789
    const startApp = tg.initDataUnsafe?.start_param || '';
    let userIdFromBot = null;
    
    if (startApp && startApp.startsWith('user_id_')) {
        userIdFromBot = startApp.replace('user_id_', '');
        console.log('Получен user_id из start_param:', userIdFromBot);
    }
    
    // Также проверяем URL параметры для совместимости
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = urlParams.get('user_id') || urlParams.get('userId');
    
    // Пытаемся получить данные из Telegram WebApp
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        CONFIG.userId = userIdFromBot || userIdFromUrl || tg.initDataUnsafe.user.id;
        CONFIG.userName = tg.initDataUnsafe.user.first_name;
        console.log('Получены данные пользователя из Telegram:', CONFIG.userId, CONFIG.userName);
    } else {
        // Пытаемся получить из URL параметров или start_param
        CONFIG.userId = userIdFromBot || userIdFromUrl;
        CONFIG.userName = urlParams.get('userName') || urlParams.get('user_name');
        console.log('Получены данные пользователя из URL/start_param:', CONFIG.userId, CONFIG.userName);
    }

    // Если всё еще нет userId, создаем анонимный идентификатор
    if (!CONFIG.userId) {
        CONFIG.userId = `anonymous_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        console.log('Создан анонимный идентификатор пользователя:', CONFIG.userId);
    }

    // Если нет имени пользователя, используем дефолтное
    if (!CONFIG.userName) {
        CONFIG.userName = 'Пользователь';
    }

    // Логируем финальные значения
    console.log('Финальные данные пользователя:', {
        userId: CONFIG.userId,
        userName: CONFIG.userName,
        startParam: startApp,
        urlUserId: userIdFromUrl
    });
}

// Проверка URL на наличие параметров возврата от YooKassa
function checkUrlForPaymentStatus() {
    const orderId = getQueryParam('order_id') || getQueryParam('orderId');
    const success = getQueryParam('success');
    const paymentId = getQueryParam('payment_id');
    
    console.log('Проверка URL на статус платежа:', { orderId, success, paymentId });
    
    if (orderId && (success === 'true' || success === '1' || paymentId)) {
        console.log('Обнаружен успешный платеж в URL:', orderId);
        handleSuccessfulPayment(orderId);
    }
}

// Инициализация основного интерфейса
function initUI() {
    // Получаем имя пользователя
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.innerText = CONFIG.userName;
    }

    // Генерируем карточки подписок
    const plansContainer = document.getElementById('plans');
    if (plansContainer) {
        PLANS.forEach(plan => {
            const planCard = createPlanCard(plan);
            plansContainer.appendChild(planCard);
        });
    }

    // Скрываем модальное окно успешной оплаты при загрузке
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.add('hidden');
    }

    // Скрываем ошибки при загрузке
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.classList.add('hidden');
    }
}

// Добавляем обработчики событий
function initEventListeners() {
    // Обработчик для закрытия модального окна успешной оплаты
    const closeSuccessBtn = document.getElementById('closeSuccess');
    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', () => {
            document.getElementById('successModal').classList.add('hidden');
            // Закрываем приложение Telegram после закрытия модального окна
            tg.close();
        });
    }
    
    // Добавляем обработчик для кнопки проверки платежа
    const checkPaymentButton = document.getElementById('checkPaymentButton');
    if (checkPaymentButton) {
        checkPaymentButton.addEventListener('click', () => {
            console.log('Ручная проверка статуса платежа');
            // Получаем текущий orderId
            if (currentOrderId) {
                // Изменяем текст кнопки для обратной связи
                checkPaymentButton.textContent = 'Проверяем статус платежа...';
                checkPaymentButton.disabled = true;
                
                // Пытаемся проверить статус платежа
                forceCheckPaymentStatus(currentOrderId).then(isSuccess => {
                    if (!isSuccess) {
                        // Если не удалось подтвердить платеж автоматически, спрашиваем пользователя
                        if (confirm('Не удалось автоматически определить статус платежа. Если вы уверены, что оплата прошла успешно, нажмите OK для активации подписки.')) {
                            handleSuccessfulPayment(currentOrderId);
                        } else {
                            // Возвращаем кнопку в исходное состояние
                            checkPaymentButton.textContent = 'Я уже оплатил, но не вижу подтверждения';
                            checkPaymentButton.disabled = false;
                        }
                    }
                    // Если isSuccess = true, то handleSuccessfulPayment уже будет вызван в forceCheckPaymentStatus
                });
            } else {
                alert('Не удалось определить идентификатор текущего платежа.');
            }
        });
    }

    // Глобальный обработчик для перехвата сообщений от YooKassa
    window.addEventListener('message', function(event) {
        try {
            console.log('Получено сообщение от window.message:', event.data);
            
            // Проверяем на наличие данных от YooKassa
            if (event.data && typeof event.data === 'object') {
                // Различные шаблоны данных, которые могут прийти от YooKassa
                if (
                    (event.data.type && event.data.type.startsWith('yookassa')) ||
                    (event.data.source && event.data.source === 'yookassa-checkout-widget') ||
                    (event.data.status && (event.data.status === 'success' || event.data.status === 'succeeded'))
                ) {
                    console.log('Обнаружено сообщение об оплате:', event.data);
                    
                    // Получаем orderId из сообщения или используем текущий
                    const messageOrderId = 
                        event.data.orderId || 
                        event.data.order_id || 
                        event.data.paymentId || 
                        event.data.payment_id || 
                        currentOrderId;
                    
                    if (messageOrderId) {
                        // Проверяем, действительно ли платеж успешен
                        forceCheckPaymentStatus(messageOrderId).then(isSuccess => {
                            if (isSuccess) {
                                // Платеж успешен - показываем сообщение
                                handleSuccessfulPayment(messageOrderId);
                            } else {
                                // Дополнительно проверяем, вдруг статус еще не обновился на сервере
                                setTimeout(() => {
                                    forceCheckPaymentStatus(messageOrderId);
                                }, 2000);
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка при обработке сообщения window:', error);
        }
    });
    
    // Добавляем обработчик для кнопки Назад в мини-приложении
    tg.BackButton.onClick(() => {
        // Если открыто модальное окно с оплатой, закрываем его
        const paymentModal = document.getElementById('paymentModal');
        if (paymentModal && !paymentModal.classList.contains('hidden')) {
            paymentModal.classList.add('hidden');
            tg.BackButton.hide();
            return;
        }
        
        // Если открыто модальное окно успеха, закрываем его и закрываем мини-приложение
        const successModal = document.getElementById('successModal');
        if (successModal && !successModal.classList.contains('hidden')) {
            successModal.classList.add('hidden');
            tg.close();
            return;
        }
    });
}

// Функция для обработки успешного платежа
async function handleSuccessfulPayment(orderId) {
    try {
        console.log(`Обработка успешного платежа: ${orderId}`);
        
        // Остановка всех проверок статуса платежа
        stopPaymentChecks();
        
        // Закрываем модальное окно с формой оплаты
        const paymentModal = document.getElementById('paymentModal');
        if (paymentModal) {
            paymentModal.classList.add('hidden');
        }
        
        // Скрываем индикатор загрузки
        hideLoader();
        
        // Получаем информацию о заказе из локального хранилища или определяем план по умолчанию
        let planName = 'Стандарт';
        let planDuration = 30;
        
        // Используем сохраненную информацию о плане, если она доступна
        if (window.selectedPlan) {
            planName = window.selectedPlan.name;
            // Определяем продолжительность на основе плана
            if (window.selectedPlan.id === 'basic') {
                planDuration = 30;
            } else if (window.selectedPlan.id === 'premium') {
                planDuration = 90;
            } else {
                planDuration = 30; // стандартный план
            }
        } else {
            // Пытаемся определить план из ID заказа или других источников
            if (orderId.includes('basic')) {
                planName = 'Базовый';
                planDuration = 30;
            } else if (orderId.includes('premium')) {
                planName = 'Премиум';
                planDuration = 90;
            }
        }
        
        // Активируем подписку через API платежной системы
        const subscriptionResponse = await fetch(`${CONFIG.apiUrl}/api/activate-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: CONFIG.userId,
                orderId: orderId,
                planName: planName,
                planDuration: planDuration
            })
        });
        
        const subscriptionData = await subscriptionResponse.json();
        
        if (!subscriptionResponse.ok || !subscriptionData.success) {
            throw new Error(subscriptionData.error || 'Не удалось активировать подписку');
        }
        
        console.log('Подписка успешно активирована:', subscriptionData);
        
        // Используем нативный попап Telegram вместо модального окна
        if (tg.showPopup && typeof tg.showPopup === 'function') {
            // Показываем попап через Telegram Web App API
            tg.showPopup({
                title: '✅ Оплата успешна!',
                message: `Ваша подписка "${planName}" успешно активирована на ${planDuration} дней`,
                buttons: [{ type: 'close' }]
            }, () => {
                // Закрываем приложение после закрытия попапа
                tg.close();
            });
        } else {
            // Если не удалось показать через Telegram API, используем обычное модальное окно
            const successModal = document.getElementById('successModal');
            if (successModal) {
                // Обновляем текст в модальном окне
                const modalTitle = successModal.querySelector('h2');
                const modalText = successModal.querySelector('p');
                if (modalTitle) modalTitle.textContent = 'Оплата успешна!';
                if (modalText) modalText.textContent = `Ваша подписка "${planName}" активирована на ${planDuration} дней`;
                
                successModal.classList.remove('hidden');
                successModal.classList.add('modal-visible');
            }
            
            // Закрываем приложение через 3 секунды
            setTimeout(() => {
                tg.close();
            }, 3000);
        }
        
    } catch (error) {
        console.error('Ошибка при обработке успешного платежа:', error);
        
        // Показываем ошибку пользователю
        if (tg.showAlert && typeof tg.showAlert === 'function') {
            tg.showAlert(`Ошибка при активации подписки: ${error.message}`);
        } else {
            showError(`Ошибка при активации подписки: ${error.message}`);
        }
    }
}

// Создание карточки тарифного плана
function createPlanCard(plan) {
    const card = document.createElement('div');
    card.className = `plan-card ${plan.popular ? 'popular' : ''}`;
    card.id = `plan-${plan.id}`;

    // Формируем информацию о количестве генераций
    const generationsText = plan.generations === -1 ? 'Безлимит' : `${plan.generations} генераций`;
    const popularBadge = plan.popular ? '<div class="popular-badge">Популярный</div>' : '';

    card.innerHTML = `
        ${popularBadge}
        <h3>${plan.name}</h3>
        <p class="price">${plan.price} ₽</p>
        <p class="generations">${generationsText}</p>
        <p class="description">${plan.description}</p>
        <p class="duration">Срок: ${plan.duration} дней</p>
        <button class="buy-btn" data-plan-id="${plan.id}" data-plan-name="${plan.name}" data-price="${plan.price}">
            Оформить
        </button>
    `;

    // Добавляем обработчик нажатия на кнопку "Оформить"
    const buyBtn = card.querySelector('.buy-btn');
    buyBtn.addEventListener('click', () => handlePlanSelection(plan));

    return card;
}

// Обработка выбора тарифного плана
async function handlePlanSelection(plan) {
    console.log(`Выбран план "${plan.name}" за ${plan.price} ₽`);
    
    // Сохраняем информацию о выбранном плане в глобальной переменной
    window.selectedPlan = plan;
    
    // Показываем индикатор загрузки
    showLoader();
    
    // Блокируем кнопки покупки на время обработки
    setButtonsState(false);
    
    try {
        // Проверяем данные пользователя перед отправкой
        if (!CONFIG.userId) {
            // Повторно инициализируем данные на случай, если что-то пошло не так
            initUserData();
        }
        
        console.log('Отправляем запрос на создание платежа с пользователем:', CONFIG.userId);
        
        // Отправляем запрос на создание платежа с информацией о плане
        const paymentData = await createPayment(plan.price, plan.name, CONFIG.userId, plan);
        console.log('Данные платежа:', paymentData);
        
        if (!paymentData || paymentData.error) {
            throw new Error(paymentData?.error || 'Не удалось создать платеж');
        }
        
        // Сохраняем ID заказа для отслеживания
        currentOrderId = paymentData.orderId;
        
        // Обрабатываем платеж в зависимости от режима
        if (paymentData.testMode && paymentData.redirectUrl) {
            // В тестовом режиме перенаправляем пользователя на страницу оплаты
            console.log('Перенаправляем на страницу оплаты:', paymentData.redirectUrl);
            window.location.href = paymentData.redirectUrl;
        } else {
            // В боевом режиме инициализируем платежный виджет с полученным токеном
            await initPaymentWidget(
                paymentData.confirmationToken, 
                paymentData.orderId
            );
            
            // Показываем кнопку Назад при открытии платежной формы
            if (tg.BackButton) {
                tg.BackButton.show();
            }
        }
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        
        // Показываем детальную ошибку пользователю
        const errorMessage = error.message || 'Не удалось создать платеж';
        
        showError(`Не удалось создать платеж: ${errorMessage}`);
        
        // Если ошибка связана с авторизацией, даем дополнительную информацию
        if (errorMessage.includes('авторизации') || errorMessage.includes('auth')) {
            console.log('Ошибка авторизации в платежной системе, рекомендуется проверить настройки магазина');
        }
    } finally {
        // Скрываем индикатор загрузки
        hideLoader();
        
        // Разблокируем кнопки покупки
        setButtonsState(true);
    }
}

// Функция для создания платежа на сервере
async function createPayment(amount, planName, userId, plan) {
    try {
        console.log(`Создание платежа: ${amount} руб., план: ${planName}, пользователь: ${userId}`);
        
        // В боевом режиме нужен email для чека (54-ФЗ)
        let email = "customer@example.com"; // значение по умолчанию
        
        // Запрашиваем email у пользователя для чека
        try {
            const userEmail = prompt("Введите email для получения чека:", "");
            if (userEmail && userEmail.includes("@") && userEmail.includes(".")) {
                email = userEmail;
            }
        } catch (e) {
            console.log("Не удалось запросить email, используем значение по умолчанию");
        }
        
        const response = await fetch(`${CONFIG.apiUrl}/api/create-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount.toString(),
                planName: planName,
                userId: userId,
                description: `Подписка "${planName}"`,
                email: email, // Добавляем email для чека
                plan: plan
            })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || responseData.details || `Ошибка сервера: ${response.status}`);
        }
        
        return responseData;
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        throw error;
    }
}

// Остановка всех проверок статуса платежа
function stopPaymentChecks() {
    if (window.statusCheckInterval) {
        clearInterval(window.statusCheckInterval);
        window.statusCheckInterval = null;
    }
    paymentCheckActive = false;
}

// Инициализация платежного виджета ЮKassa
async function initPaymentWidget(token, orderId) {
    console.log('Инициализация платежного виджета YooKassa');
    
    // Очищаем контейнер для виджета
    const paymentContainer = document.getElementById('paymentFormContainer');
    paymentContainer.innerHTML = '';
    
    // Показываем контейнер с формой оплаты
    const paymentModal = document.getElementById('paymentModal');
    paymentModal.classList.remove('hidden');
    
    // Добавляем кнопку закрытия модального окна
    const closePaymentBtn = document.getElementById('closePayment');
    closePaymentBtn.addEventListener('click', () => {
        paymentModal.classList.add('hidden');
        
        // Останавливаем любые запущенные проверки статуса
        stopPaymentChecks();
        
        // Скрываем кнопку Назад
        if (tg.BackButton) {
            tg.BackButton.hide();
        }
    });
    
    try {
        // Проверяем наличие библиотеки YooKassa
        if (typeof YooMoneyCheckoutWidget !== 'function') {
            throw new Error('Библиотека YooKassa не загружена');
        }
        
        // Инициализация виджета YooKassa
        const yooKassaWidget = new YooMoneyCheckoutWidget({
            confirmation_token: token,
            return_url: window.location.href + '?orderId=' + orderId + '&success=true',
            embedded_3ds: true,
            error_callback: function(error) {
                console.error('Ошибка YooKassa виджета:', error);
                showError(`Ошибка платежного виджета: ${error.message || 'Неизвестная ошибка'}`);
            },
            // Добавляем обработчик успешной оплаты
            success_callback: function(data) {
                console.log('Успешная оплата YooKassa:', data);
                handleSuccessfulPayment(orderId);
            }
        });
        
        // Отрисовка виджета
        yooKassaWidget.render('paymentFormContainer')
            .then(() => {
                console.log('Виджет YooKassa успешно отрисован');
                
                // Добавляем обработчики для iframe, чтобы отслеживать изменения в форме
                const iframes = document.querySelectorAll('#paymentFormContainer iframe');
                iframes.forEach(iframe => {
                    // Добавляем класс для стилизации при необходимости
                    iframe.classList.add('yookassa-iframe');
                    
                    // Отслеживаем изменения в iframe для определения оплаты
                    try {
                        // Попытка отловить навигацию внутри iframe
                        iframe.addEventListener('load', () => {
                            console.log('Iframe загрузил новое содержимое, проверяем статус платежа');
                            // Проверяем платеж дополнительно при каждой перезагрузке iframe
                            forceCheckPaymentStatus(orderId);
                        });
                    } catch (err) {
                        console.log('Не удалось добавить обработчик load к iframe');
                    }
                });
                
                // Запускаем периодическую проверку статуса платежа
                checkPaymentStatus(orderId);
                
                // Дополнительно устанавливаем таймеры проверки платежа
                setupAdditionalPaymentChecks(orderId);
            })
            .catch(err => {
                console.error('Ошибка при отрисовке виджета YooKassa:', err);
                showError(`Не удалось отобразить форму оплаты: ${err.message || 'Неизвестная ошибка'}`);
            });
    } catch (error) {
        console.error('Ошибка инициализации виджета YooKassa:', error);
        showError(`Ошибка инициализации платежного виджета: ${error.message}`);
    }
}

// Функция для проверки статуса платежа
function checkPaymentStatus(orderId) {
    console.log(`Начинаем проверку статуса платежа ${orderId}`);
    
    // Проверяем, не активна ли уже проверка статуса
    if (paymentCheckActive) {
        console.log('Проверка статуса уже активна, пропускаем');
        return;
    }
    
    paymentCheckActive = true;
    
    // Очищаем предыдущую проверку, если она существует
    stopPaymentChecks();
    
    // Интервал для проверки статуса каждые 2 секунды
    window.statusCheckInterval = setInterval(async () => {
        try {
            // Проверяем, открыто ли еще модальное окно
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && paymentModal.classList.contains('hidden')) {
                console.log('Модальное окно платежа закрыто, останавливаем проверку статуса');
                stopPaymentChecks();
                return;
            }
            
            // Запрашиваем статус платежа с сервера
            const response = await fetch(`${CONFIG.apiUrl}/api/payment-status/${orderId}`);
            
            if (!response.ok) {
                console.error('Ошибка при запросе статуса платежа:', response.status);
                return;
            }
            
            const statusData = await response.json();
            
            console.log(`Статус платежа ${orderId}:`, statusData);
            
            // Если платеж успешно завершен
            if (statusData.status === 'succeeded') {
                // Останавливаем проверку статуса
                stopPaymentChecks();
                
                // Обрабатываем успешный платеж
                handleSuccessfulPayment(orderId);
            }
            
            // Если платеж отменен или произошла ошибка
            if (statusData.status === 'canceled') {
                // Останавливаем проверку статуса
                stopPaymentChecks();
                
                // Показываем сообщение об ошибке
                showError('Платеж был отменен');
            }
        } catch (error) {
            console.error('Ошибка при проверке статуса платежа:', error);
        }
    }, 2000);
    
    // Останавливаем проверку через 3 минуты (180000 мс) для избежания бесконечной проверки
    setTimeout(() => {
        if (paymentCheckActive) {
            stopPaymentChecks();
            console.log(`Проверка статуса платежа ${orderId} остановлена по таймауту`);
            
            // Если прошло 3 минуты, и мы не получили статус, показываем модальное окно с вопросом
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) {
                if (confirm('Не удалось получить подтверждение платежа. Если вы уже оплатили, нажмите OK, чтобы подтвердить оплату.')) {
                    handleSuccessfulPayment(orderId);
                }
            }
        }
    }, 180000);
}

// Установка дополнительных проверок статуса платежа
function setupAdditionalPaymentChecks(orderId) {
    // Проверка после определенных интервалов, когда пользователь может уже оплатить
    const checkPoints = [
        15000, // через 15 секунд
        30000, // через 30 секунд
        60000  // через 60 секунд
    ];
    
    checkPoints.forEach(delay => {
        setTimeout(() => {
            // Проверяем, что модальное окно всё ещё открыто и платеж не обработан
            const paymentModal = document.getElementById('paymentModal');
            const successModal = document.getElementById('successModal');
            
            if (paymentModal && 
                !paymentModal.classList.contains('hidden') && 
                successModal && 
                successModal.classList.contains('hidden')) {
                console.log(`Проверка статуса платежа ${orderId} по таймеру ${delay}ms`);
                forceCheckPaymentStatus(orderId);
            }
        }, delay);
    });
    
    // Следим за действиями пользователя для определения возможного возврата из платежной формы
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            console.log('Страница стала видимой - возможно, пользователь вернулся из платежной формы');
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) {
                forceCheckPaymentStatus(orderId);
            }
        }
    });
}

// Принудительная проверка статуса платежа
async function forceCheckPaymentStatus(orderId) {
    try {
        console.log(`Принудительная проверка статуса платежа: ${orderId}`);
        
        // Запрашиваем статус платежа с сервера
        const response = await fetch(`${CONFIG.apiUrl}/api/payment-status/${orderId}`);
        
        if (!response.ok) {
            console.error('Ошибка при запросе статуса платежа:', response.status);
            return false;
        }
        
        const statusData = await response.json();
        
        console.log(`Получен статус платежа ${orderId}:`, statusData);
        
        // Если платеж успешно завершен
        if (statusData.status === 'succeeded') {
            console.log('Обнаружен успешный платеж при принудительной проверке');
            handleSuccessfulPayment(orderId);
            return true;
        }
    } catch (error) {
        console.error('Ошибка при принудительной проверке статуса платежа:', error);
    }
    
    return false;
}

// Показать модальное окно успешной оплаты
function showSuccessModal() {
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.remove('hidden');
    }
}

// Показать сообщение об ошибке
function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // Скрываем сообщение через 5 секунд
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    } else {
        alert(message);
    }
}

// Показать индикатор загрузки
function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('hidden');
    }
}

// Скрыть индикатор загрузки
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

// Включить/отключить кнопки покупки
function setButtonsState(enabled) {
    const buttons = document.querySelectorAll('.buy-btn');
    buttons.forEach(button => {
        button.disabled = !enabled;
    });
}

// Вспомогательная функция для получения параметров из URL
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
} 