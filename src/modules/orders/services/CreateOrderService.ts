import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';
import { check } from 'prettier';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Could not find any customer with the giver id');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const existentProductsId = existentProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existentProductsId.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find product: [${checkInexistentProducts
          .map(product => product.id)
          .join(', ')}]`,
      );
    }

    const findProductsWithNotQuantityAvailable = products.filter(
      productRequest => {
        const availableQuantity = existentProducts.find(
          productDB => productDB.id === productRequest.id,
        )?.quantity as number;
        return availableQuantity < productRequest.quantity;
      },
    );

    if (findProductsWithNotQuantityAvailable.length) {
      throw new AppError(
        `The quantity ${findProductsWithNotQuantityAvailable[0].quantity} is not available for ${findProductsWithNotQuantityAvailable[0].id}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.find(p => p.id === product.id)?.price as number,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        (existentProducts.find(p => p.id === product.product_id)
          ?.quantity as number) - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
