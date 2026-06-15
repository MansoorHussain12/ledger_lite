import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import customersRouter from "./customers";
import productsRouter from "./products";
import saleOrdersRouter from "./saleOrders";
import paymentsRouter from "./payments";
import reportsRouter from "./reports";
import dashboardRouter from "./dashboard";
import cashbookRouter from "./cashbook";
import suppliersRouter from "./suppliers";
import inventoryRouter from "./inventory";
import installmentsRouter from "./installments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(customersRouter);
router.use(productsRouter);
router.use(saleOrdersRouter);
router.use(paymentsRouter);
router.use(reportsRouter);
router.use(dashboardRouter);
router.use(cashbookRouter);
router.use(suppliersRouter);
router.use(inventoryRouter);
router.use(installmentsRouter);

export default router;
