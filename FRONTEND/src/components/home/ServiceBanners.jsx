import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, RotateCcw, Clock, Headphones } from 'lucide-react';

function ServiceBanners() {
  const services = [
    {
      id: 1,
      icon: <Truck className="text-primary-600" size={32} />,
      title: 'Free Shipping',
      description: 'On orders over $99',
      bgColor: 'bg-primary-50',
    },
    {
      id: 2,
      icon: <RotateCcw className="text-accent-600" size={32} />,
      title: 'Easy Returns',
      description: '30-day return policy',
      bgColor: 'bg-accent-50',
    },
    {
      id: 3,
      icon: <Clock className="text-amber-600" size={32} />,
      title: 'Fast Delivery',
      description: '2-3 business days',
      bgColor: 'bg-amber-50',
    },
    {
      id: 4,
      icon: <Headphones className="text-green-600" size={32} />,
      title: 'Expert Support',
      description: '24/7 technical help',
      bgColor: 'bg-green-50',
    },
  ];

  return (
    <section className="py-10 bg-white">
      <div className="container-custom">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((service) => (
            <div 
              key={service.id}
              className={`${service.bgColor} rounded-lg p-6 flex items-center justify-center md:justify-start transition-transform hover:shadow-md hover:-translate-y-1`}
            >
              <div className="mr-4">
                {service.icon}
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900">{service.title}</h3>
                <p className="text-sm text-neutral-600">{service.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ServiceBanners;