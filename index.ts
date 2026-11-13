import { registerRootComponent } from 'expo';
import './src/background'; // Task muss beim Start definiert sein
import App from './App';

registerRootComponent(App);
